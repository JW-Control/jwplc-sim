// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G2_UNSUPPORTED_LIB_MSG: deep sleep (esp_deep_sleep_start)
void setup() { esp_sleep_enable_timer_wakeup(1000000); esp_deep_sleep_start(); }
void loop() {}
