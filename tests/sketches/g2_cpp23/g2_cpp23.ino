// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sketch que solo compila en C++23 (sufijo uz, std::to_underlying): el build
// lo intenta en C++20 y lo repite en C++23 como el package (cli/lib/build.mjs).
#include <utility>

enum class Modo : uint8_t { Manual = 1, Auto = 2 };

void setup() {
  Serial.begin(115200);
  auto n = 3uz;
  Serial.printf("modo=%d n=%u\n", std::to_underlying(Modo::Auto), static_cast<unsigned>(n));
}

void loop() { delay(1000); }
