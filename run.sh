#!/usr/bin/env bash
# Starts the Solaris stack in the background, logs in .run/:
#   operator service  http://localhost:4100   (readings, payouts, proofs, faucet)
#   USB bridge        ESP32 on /dev/ttyACM0 -> operator   (skipped if no ESP32 is plugged in)
#   virtual meter     signed demo readings for the Night Demo project
#   investor app      http://localhost:3100
#   ngrok tunnel      public HTTPS address for the operator, used by the Vercel deployment
#
#   ./run.sh          start everything
#   ./run.sh stop     stop everything
set -u
cd "$(dirname "$0")"
ROOT=$(pwd)
mkdir -p .run

stop() {
  for port in 3100 4100; do fuser -k "$port/tcp" >/dev/null 2>&1 || true; done
  pkill -f '^ngrok http 4100' >/dev/null 2>&1 || true
  # Also catch copies started by hand, which have no pid file.
  pkill -f '^python3 -I (-u )?(firmware/)?tools/usb_bridge.py' >/dev/null 2>&1 || true
  pkill -f '^bun run scripts/virtual-meter.ts' >/dev/null 2>&1 || true
  for pidfile in .run/*.pid; do
    [ -f "$pidfile" ] || continue
    kill -- -"$(cat "$pidfile")" >/dev/null 2>&1 || kill "$(cat "$pidfile")" >/dev/null 2>&1 || true
    rm -f "$pidfile"
  done
}

start() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  (cd "$ROOT/$dir" && exec setsid "$@" >"$ROOT/.run/$name.log" 2>&1) &
  echo $! >"$ROOT/.run/$name.pid"
  echo "  started $name (log: .run/$name.log)"
}

if [ "${1:-}" = "stop" ]; then
  stop
  echo "Stopped."
  exit 0
fi

stop
echo "Starting Solaris…"
start operator operator bun run src/server.ts
sleep 3
if [ -e /dev/ttyACM0 ]; then
  if [ -r /dev/ttyACM0 ]; then
    start usb-bridge firmware python3 -I -u tools/usb_bridge.py
  else
    # Group membership not active in this session yet: borrow it.
    start usb-bridge firmware sg uucp -c "python3 -I -u tools/usb_bridge.py"
  fi
else
  echo "  no ESP32 on /dev/ttyACM0: skipping USB bridge"
fi
[ -f operator/data/virtual-meter.json ] && start virtual-meter operator bun run scripts/virtual-meter.ts http://localhost:4100
start app app bun run dev -p 3100
start ngrok . ngrok http 4100 --log stdout

# The Vercel deployment reaches the operator through this tunnel. If its address changes,
# Vercel needs the new one (free ngrok addresses can change between restarts).
tunnel=""
for _ in $(seq 1 15); do
  sleep 2
  tunnel=$(curl -s localhost:4040/api/tunnels | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else '')" 2>/dev/null)
  [ -n "$tunnel" ] && break
done
echo
echo "Investor app:  http://localhost:3100   (public: https://solaris-labs-rose.vercel.app)"
echo "Operator API:  http://localhost:4100/api/projects"
if [ -z "$tunnel" ]; then
  echo "WARNING: ngrok tunnel did not start; the public site can't reach the operator. See .run/ngrok.log"
elif [ "$tunnel" != "$(cat .run/operator-url 2>/dev/null)" ]; then
  echo "Tunnel:        $tunnel   (NEW address: update Vercel, then redeploy)"
  echo "  cd app && printf '%s' '$tunnel' | vercel env add OPERATOR_URL production --force && vercel deploy --prod --yes"
  echo "$tunnel" > .run/operator-url
else
  echo "Tunnel:        $tunnel"
fi
