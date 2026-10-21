#!/usr/bin/env bash
# Keep the Paperclip Next.js app alive on the tests2 box.
#
#   bash scripts/supervise.sh            # run the supervisor in the foreground
#   bash scripts/supervise.sh --status   # is it alive? what did health say last?
#   bash scripts/supervise.sh --stop     # stop supervisor + its app process tree
#
# The supervisor starts `npm start` from $APP_DIR (default ~/paperclip-app),
# restarts it whenever it exits (2s backoff, capped at 30s) and probes
# /api/pdf/health every 30s. Three failed probes in a row kill the app
# process tree so the normal restart path can bring it back.
#
# Never uses `pkill -f`: over ssh the pattern matches the remote `bash -c`
# command line and kills the calling session. Kills use a /proc parent scan
# rooted at the supervisor's own child (plus the child's process group when
# it is a group leader), so nothing outside this supervisor is touched.

set -u

APP_DIR="${APP_DIR:-$HOME/paperclip-app}"
APP_LOG="${APP_LOG:-$HOME/app.log}"
LOG="${SUPERVISOR_LOG:-$HOME/supervisor.log}"
PIDFILE="${SUPERVISOR_PIDFILE:-$HOME/supervisor.pid}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/pdf/health}"
NODE_BIN="${NODE_BIN:-$HOME/node22/bin}"
CHROME_LIBS="${CHROME_LIBS:-$HOME/cdeps/usr/lib/x86_64-linux-gnu}"
CHROME_BIN="${CHROME_BIN:-$HOME/chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell}"

HEALTH_INTERVAL="${HEALTH_INTERVAL:-30}"   # seconds between probes
HEALTH_FAILS_MAX="${HEALTH_FAILS_MAX:-3}"  # consecutive failures before the watchdog kills the app
BACKOFF_MIN=2
BACKOFF_MAX=30

STOP=0
CHILD=""
CHILD_PGID=""
SETSID=""
command -v setsid >/dev/null 2>&1 && SETSID="setsid"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '%s %s\n' "$(ts)" "$*" >>"$LOG"; }

# Read a process's command line (NUL separated) as text.
proc_cmd() {
  [ -r "/proc/$1/cmdline" ] || return 1
  tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null
}

pid_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# Like pid_alive, but excludes zombies: an unreaped child still answers
# kill -0, and a zombie must not keep the monitor loop alive.
pid_running() {
  local pid="${1:-}" stat state
  [ -n "$pid" ] && [ -r "/proc/$pid/stat" ] || return 1
  stat=$(cat "/proc/$pid/stat" 2>/dev/null) || return 1
  state=${stat##*) }
  state=${state%% *}
  [ "$state" != "Z" ]
}

# Kill a process and every descendant found by scanning /proc, because the
# child is started with setsid and survives intermediate shells exiting.
kill_tree() {
  local root="$1" pgid="${2:-}"
  [ -n "$root" ] || return 0
  if ! pid_alive "$root" && [ -z "$pgid" ]; then
    return 0
  fi
  python3 - "$root" "$pgid" <<'PY'
import os, signal, sys, time

root = int(sys.argv[1])
pgid = int(sys.argv[2]) if sys.argv[2] else 0
me = os.getpid()

def children(pid):
    kids = []
    for entry in os.listdir('/proc'):
        if not entry.isdigit():
            continue
        try:
            stat = open('/proc/%s/stat' % entry, 'rb').read().decode('utf-8', 'replace')
            # pid (comm) state ppid ... ; comm may contain spaces/parens
            ppid = int(stat.rsplit(')', 1)[1].split()[1])
        except Exception:
            continue
        if ppid == pid:
            kids.append(int(entry))
    return kids

def collect(pid, acc):
    for kid in children(pid):
        if kid not in acc:
            acc.add(kid)
            collect(kid, acc)

pids = set()
collect(root, pids)
pids.add(root)
pids.discard(me)

# If the app was started with setsid it is its own process-group leader;
# signalling the group also catches already-orphaned descendants.
group_leader = pgid > 0
if not group_leader:
    try:
        group_leader = os.getpgid(root) == root
        if group_leader:
            pgid = root
    except Exception:
        pass

def signal_all(sig):
    if group_leader:
        try:
            os.killpg(pgid, sig)
        except Exception:
            pass
    for pid in pids:
        try:
            os.kill(pid, sig)
        except Exception:
            pass

signal_all(signal.SIGTERM)
deadline = time.time() + 5
while time.time() < deadline:
    still_alive = False
    for pid in pids:
        try:
            stat = open('/proc/%d/stat' % pid, 'rb').read().decode('utf-8', 'replace')
            if stat.rsplit(')', 1)[1].split()[0] != 'Z':
                still_alive = True
                break
        except Exception:
            continue
    if not still_alive:
        break
    time.sleep(0.2)
signal_all(signal.SIGKILL)
PY
}

# ---------------------------------------------------------------- lifecycle

start_app() {
  mkdir -p "$APP_DIR" 2>/dev/null || true
  : >>"$APP_LOG"
  # The subshell cds first so npm's cwd (and Next's project root) is right.
  # setsid gives the app its own process group, so a crash can never reach
  # the supervisor or the ssh session.
  (
    cd "$APP_DIR" || exit 1
    exec ${SETSID:+$SETSID }env \
      PATH="$NODE_BIN:$PATH" \
      LD_LIBRARY_PATH="$CHROME_LIBS" \
      CHROMIUM_PATH="$CHROME_BIN" \
      npm start
  ) >>"$APP_LOG" 2>&1 &
  CHILD=$!
  CHILD_PGID=""
  [ -n "$SETSID" ] && CHILD_PGID="$CHILD"
  log "[supervise] started app pid=$CHILD (cwd=$APP_DIR)"
}

check_health() {
  local code
  code=$(curl -fsS --max-time 10 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)
  if [ "$code" = "200" ]; then
    HEALTH_FAILS=0
    BACKOFF=$BACKOFF_MIN
    log "[supervise] health ok ($HEALTH_URL)"
    return 0
  fi
  HEALTH_FAILS=$((HEALTH_FAILS + 1))
  log "[supervise] health fail ${HEALTH_FAILS}/${HEALTH_FAILS_MAX} (${HEALTH_URL} -> ${code:-no response})"
  return 1
}

# Wait for the app to exit while probing health every HEALTH_INTERVAL.
# Returns once the child is gone (naturally, or killed by the watchdog).
monitor_app() {
  local now next_check
  HEALTH_FAILS=0
  next_check=$(( $(date +%s) + HEALTH_INTERVAL ))
  while pid_running "$CHILD"; do
    if [ "$STOP" -eq 1 ]; then
      return 0
    fi
    now=$(date +%s)
    if [ "$now" -ge "$next_check" ]; then
      if ! check_health && [ "$HEALTH_FAILS" -ge "$HEALTH_FAILS_MAX" ]; then
        log "[supervise] watchdog: ${HEALTH_FAILS} consecutive health failures, killing app pid=$CHILD"
        kill_tree "$CHILD" "$CHILD_PGID"
        break
      fi
      next_check=$(( $(date +%s) + HEALTH_INTERVAL ))
    fi
    sleep 5
  done
}

stop_child() {
  if [ -n "$CHILD" ] && pid_alive "$CHILD"; then
    kill_tree "$CHILD" "$CHILD_PGID"
  fi
  # Reap the direct child if it is still waitable.
  if [ -n "$CHILD" ]; then
    wait "$CHILD" 2>/dev/null
  fi
}

# --------------------------------------------------------------------- CLI

read_pidfile() {
  [ -r "$PIDFILE" ] || return 1
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null)
  case "$pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s' "$pid"
}

supervisor_pid() {
  local pid
  pid=$(read_pidfile) || return 1
  pid_alive "$pid" || return 1
  proc_cmd "$pid" | grep -q 'supervise\.sh' || return 1
  printf '%s' "$pid"
}

last_health_line() {
  [ -r "$LOG" ] || return 0
  grep -a '\[supervise\] health ' "$LOG" 2>/dev/null | tail -n 1
}

status() {
  local pid child
  if pid=$(supervisor_pid); then
    echo "supervisor: running (pid $pid)"
    child=$(pgrep -P "$pid" 2>/dev/null | head -n 1)
    [ -n "$child" ] && echo "app child: $child"
    echo "last health: $(last_health_line)"
    return 0
  fi
  echo "supervisor: not running"
  if [ -f "$PIDFILE" ]; then
    echo "pidfile: stale ($PIDFILE)"
  fi
  echo "last health: $(last_health_line)"
  return 3
}

stop_supervisor() {
  local pid i
  if ! pid=$(supervisor_pid); then
    echo "supervisor: not running"
    rm -f "$PIDFILE"
    return 0
  fi
  echo "stopping supervisor pid $pid"
  kill -TERM "$pid" 2>/dev/null
  for i in $(seq 1 40); do
    pid_alive "$pid" || break
    sleep 0.25
  done
  if pid_alive "$pid"; then
    echo "supervisor did not exit, sending SIGKILL"
    kill -KILL "$pid" 2>/dev/null
  fi
  rm -f "$PIDFILE"
  echo "supervisor: stopped"
}

run_supervisor() {
  local pid code started ran delay
  if pid=$(supervisor_pid); then
    echo "supervisor already running (pid $pid)" >&2
    exit 1
  fi
  rm -f "$PIDFILE"
  echo $$ >"$PIDFILE"

  trap 'STOP=1; log "[supervise] stop requested"; stop_child' TERM INT HUP

  BACKOFF=$BACKOFF_MIN
  log "[supervise] supervisor started pid=$$ app_dir=$APP_DIR"

  while [ "$STOP" -eq 0 ]; do
    started=$(date +%s)
    start_app
    monitor_app
    if [ "$STOP" -eq 0 ]; then
      # Capture the exit status; kill_tree in stop_child may already have
      # reaped it, in which case wait returns promptly.
      wait "$CHILD" 2>/dev/null
      code=$?
      ran=$(( $(date +%s) - started ))
      # Make sure no stragglers keep port 3000 occupied.
      kill_tree "$CHILD" "$CHILD_PGID"
      log "[supervise] app exited (code=$code) after ${ran}s"
      [ "$STOP" -eq 1 ] && break
      log "[supervise] restarting (code=$code) in ${BACKOFF}s"
      delay=$BACKOFF
      if [ "$ran" -ge 60 ]; then
        BACKOFF=$BACKOFF_MIN
        delay=$BACKOFF
      else
        BACKOFF=$(( BACKOFF * 2 ))
        [ "$BACKOFF" -gt "$BACKOFF_MAX" ] && BACKOFF=$BACKOFF_MAX
      fi
      for i in $(seq 1 "$delay"); do
        [ "$STOP" -eq 1 ] && break
        sleep 1
      done
    fi
  done

  stop_child
  rm -f "$PIDFILE"
  log "[supervise] supervisor stopped"
}

case "${1:---run}" in
  --run)    run_supervisor ;;
  --status) status ;;
  --stop)   stop_supervisor ;;
  -h|--help)
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "usage: $0 [--run|--status|--stop]" >&2
    exit 2
    ;;
esac
