#!/bin/bash
# Keeps a localhost.run tunnel alive and records the current public URL.
# Usage on tests2: setsid nohup bash ~/tunnel-loop.sh >/dev/null 2>&1 &
while true; do
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes -R 80:localhost:3000 nokey@localhost.run 2>&1 \
  | while IFS= read -r line; do
      echo "$(date '+%H:%M:%S') $line" >> "$HOME/tunnel.log"
      if [[ "$line" =~ (https://[a-z0-9]+\.lhr\.life) ]]; then
        echo "${BASH_REMATCH[1]}" > "$HOME/tunnel-url.txt"
        echo "$(date '+%H:%M:%S') published ${BASH_REMATCH[1]}" >> "$HOME/tunnel.log"
      fi
    done
  echo "$(date '+%H:%M:%S') tunnel exited, reconnecting" >> "$HOME/tunnel.log"
  sleep 3
done
