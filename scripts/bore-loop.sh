#!/bin/bash
# Stable public address: http://bore.pub:45123 (fixed remote port, auto-reconnect)
while true; do
  "$HOME/bore" local 3000 --to bore.pub --port 45123 >> "$HOME/bore.log" 2>&1
  echo "$(date '+%H:%M:%S') bore exited, reconnecting" >> "$HOME/bore.log"
  sleep 2
done
