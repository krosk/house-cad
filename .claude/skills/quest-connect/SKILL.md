---
name: quest-connect
description: Connect adb to the owner's Quest 3 over Wireless debugging (finding a changed port by scanning the headset) and forward DevTools, before a read, a write or update-app. Follows docs/headset-data.md "Connecting".
argument-hint: [quest-ip | quest-ip:port]
---

House-cad's copy of the sibling project's quest-connect skill (`../quest-mcp-test`), cut down to what
this repo needs: no Godot, no MCP port. The canonical procedure is `docs/headset-data.md`
"Connecting"; this skill scripts it.

1. Run `.claude/skills/quest-connect/connect.sh $ARGUMENTS`. It uses **Bubblewrap's adb**
   (`~/.bubblewrap/android_sdk/platform-tools/adb`). Never use QRookie's adb (owner, 2026-10-19:
   Bubblewrap's is much more reliable).
   - The script tries, in order:
     1. a device already listed;
     2. the `ip:port` given;
     3. 10 s for adb's own mDNS reconnect;
     4. the last address that worked (`~/.cache/house-cad/quest-adb-addr`, outside the repo);
     5. a scan of that one host for the wireless-debugging port, which changes each time Wireless
        debugging restarts (`find-adb-port.py`: plain TCP connects, nothing sent; 30000–50000 first).
   - It never scans other hosts. With no cached address and no argument, ask the owner for the IP shown
     in Settings › System › Developer › Wireless debugging.
   - On exit 0 it has forwarded `tcp:9333` and prints whether the headset is awake and whether the AR app
     runs.
2. If the Quest refuses the key ("failed to authenticate"), it forgot the pairing. Ask the owner to open
   Wireless debugging › Pair with code, then run
   `~/.bubblewrap/android_sdk/platform-tools/adb pair <ip>:<pairing-port>` with the six-digit code. The
   pairing port differs from the connection port. Then run step 1 again.
3. Ask the owner to open the **Quest Browser in front of them** (an empty tab is enough). DevTools calls
   time out otherwise, even with adb connected. Then continue with `quest-storage.mjs` (`update-app`,
   `backup`, `read`), per the `quest-edit` skill.

Label every claim Proven or Hypothesis (CLAUDE.md). Connecting changes nothing on the headset. Never
`adb shell pm clear com.krosk.housecad`.
