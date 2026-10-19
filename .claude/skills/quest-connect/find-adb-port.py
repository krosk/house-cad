#!/usr/bin/env python3
"""Find the Quest's wireless-debugging port by trying TCP connections to ONE host.

Usage: find-adb-port.py <host> [lo hi]   (default range 30000-50000)

Android picks a new random port each time Wireless debugging restarts, so a saved
ip:port goes stale ("Connection refused"). This opens a plain TCP connection to each
port of the given host (0.3 s timeout, 400 at a time) and sends nothing; it prints
the open ports, one per line. It scans only the host named, never the network.
Proven 2026-10-19: 192.168.1.36, 30000-50000 found the one open port (42795) in a
few seconds, and `adb connect` to it worked.
"""
import socket
import sys
from concurrent.futures import ThreadPoolExecutor

host = sys.argv[1]
lo, hi = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (30000, 50000)


def probe(port):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        s.connect((host, port))
        return port
    except OSError:
        return None
    finally:
        s.close()


with ThreadPoolExecutor(400) as ex:
    for p in ex.map(probe, range(lo, hi + 1)):
        if p:
            print(p)
