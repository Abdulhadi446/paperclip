#!/usr/bin/env bash
# Keep the named Cloudflare tunnel connected. It always serves the same hostname,
# so this is the stable public URL (unlike quick tunnels, which rotate).
#
# Prereqs on the host (one time):
#   cloudflared tunnel create paperclip
#   cloudflared tunnel route dns --overwrite-dns <tunnel-id> testings.thetrillioniar.me
#   ~/.cloudflared/paperclip.yml  -> ingress testings.thetrillioniar.me -> http://localhost:3000
#
# Run detached so it survives logout:
#   setsid nohup bash ~/cf-loop.sh > ~/cf.log 2>&1 < /dev/null &
set -u
CONFIG="${CF_TUNNEL_CONFIG:-$HOME/.cloudflared/paperclip.yml}"
while true; do
  echo "[$(date -Is)] starting cloudflared ($CONFIG)"
  cloudflared tunnel --no-autoupdate --config "$CONFIG" run 2>&1 | sed -u 's/^/[cf] /'
  echo "[$(date -Is)] cloudflared exited, reconnecting in 5s"
  sleep 5
done
