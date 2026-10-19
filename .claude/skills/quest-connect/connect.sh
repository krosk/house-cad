#!/usr/bin/env bash
# Connect adb to the Quest 3 over Wireless debugging, then forward DevTools for
# tools/quest-storage.mjs. Usage: connect.sh [ip | ip:port]
#
# Order: an already listed device; the given ip:port; adb's own mDNS reconnect
# (10 s); the last address that worked (~/.cache/house-cad/quest-adb-addr); then a
# port scan of that one host (find-adb-port.py). The address cache stays outside the
# repo. Exit 0 = device listed and tcp:9333 forwarded, 2 = not connected.
#
# Bubblewrap's adb, never QRookie's (owner, 2026-10-19: Bubblewrap's is much more
# reliable). Override with ADB=... if needed.
set -uo pipefail
ADB="${ADB:-$HOME/.bubblewrap/android_sdk/platform-tools/adb}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="$HOME/.cache/house-cad/quest-adb-addr"
ARG="${1:-}"

device() { "$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}'; }
try() { # ip:port -> 0 when adb reports connected
    local out; out="$(timeout 10 "$ADB" connect "$1" 2>&1)"; echo "  adb connect $1: $out"
    case "$out" in *"connected to"*) sleep 1; [ -n "$(device)" ] && { save "$1"; return 0; } ;; esac
    case "$out" in *authenticat*|*unauthorized*) echo "  the Quest refused the key: re-pair (SKILL.md)"; ;; esac
    return 1
}
save() { mkdir -p "$(dirname "$CACHE")"; echo "$1" > "$CACHE"; }

"$ADB" start-server >/dev/null 2>&1
dev="$(device)"
if [ -z "$dev" ] && [[ "$ARG" == *:* ]]; then try "$ARG" && dev="$(device)"; fi
if [ -z "$dev" ]; then
    echo "waiting up to 10 s for adb's mDNS reconnect"
    for _ in $(seq 10); do dev="$(device)"; [ -n "$dev" ] && break; sleep 1; done
fi
host="${ARG%%:*}"
[ -z "$host" ] && [ -f "$CACHE" ] && host="$(cut -d: -f1 "$CACHE")"
if [ -z "$dev" ] && [ -f "$CACHE" ] && [ "$(cut -d: -f1 "$CACHE")" = "$host" ]; then
    try "$(cat "$CACHE")" && dev="$(device)"
fi
if [ -z "$dev" ] && [ -n "$host" ]; then
    echo "scanning $host for the wireless-debugging port"
    for range in "30000 50000" "1024 29999" "50001 65535"; do
        for p in $(python3 "$HERE/find-adb-port.py" "$host" $range); do
            try "$host:$p" && { dev="$(device)"; break 2; }
        done
    done
fi
if [ -z "$dev" ]; then
    echo "NOT CONNECTED. Ask the owner: headset awake, Wireless debugging on, and its IP"
    echo "(Settings > System > Developer > Wireless debugging); then connect.sh <ip>."
    exit 2
fi

[[ "$dev" == *:* ]] && save "$dev"
echo "device: $dev ($("$ADB" -s "$dev" shell getprop ro.product.model 2>/dev/null | tr -d '\r'))"
"$ADB" -s "$dev" forward tcp:9333 localabstract:chrome_devtools_remote >/dev/null && echo "forward: tcp:9333 -> chrome_devtools_remote"
"$ADB" -s "$dev" shell dumpsys power 2>/dev/null | grep -o "mWakefulness=[A-Za-z]*"
if "$ADB" -s "$dev" shell pidof com.krosk.housecad >/dev/null 2>&1; then
    echo "AR app: RUNNING (close it before any write)"
else
    echo "AR app: not running"
fi
echo "next: the owner opens the Quest Browser in front of them (DevTools answers only then)"
exit 0
