// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G2_UNSUPPORTED_LIB_MSG: Wire como esclavo I2C
#include <Wire.h>
// Wire (I2C0) ya es maestro del TCA6424A desde el arranque del core, como en
// la placa: el esclavo se prueba en Wire1.
void setup() { Wire1.begin((uint8_t)0x42, 25, 26, 100000); }
void loop() {}
