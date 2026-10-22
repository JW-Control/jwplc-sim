// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G2_UNSUPPORTED_LIB_MSG: librería BluetoothSerial (radio del ESP32)
#include <BluetoothSerial.h>
BluetoothSerial bt;

void setup() { bt.begin("JWPLC"); }
void loop() {}
