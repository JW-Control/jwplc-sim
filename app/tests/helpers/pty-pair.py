#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 JW Control
# SPDX-License-Identifier: GPL-3.0-or-later
# Par de pty para la prueba del puerto COM virtual en Linux (hace de com0com):
# imprime "PTY <ruta del esclavo>", luego "R <hex>" por cada lectura del
# maestro, y escribe en el maestro cada línea "W <hex>" de stdin.
import os, pty, select, sys, tty

master, slave = pty.openpty()
tty.setraw(slave)
print("PTY", os.ttyname(slave), flush=True)
while True:
    r, _, _ = select.select([master, sys.stdin], [], [])
    if master in r:
        try:
            data = os.read(master, 4096)
        except OSError:
            data = b""
        if data:
            print("R", data.hex(), flush=True)
    if sys.stdin in r:
        line = sys.stdin.readline()
        if not line:
            break
        if line.startswith("W "):
            os.write(master, bytes.fromhex(line[2:].strip()))
