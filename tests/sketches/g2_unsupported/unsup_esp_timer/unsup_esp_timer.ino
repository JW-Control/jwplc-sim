// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G2_UNSUPPORTED_LIB_MSG: esp_timer
#include <esp_timer.h>
static void cb(void *) {}
void setup() {
  esp_timer_create_args_t a = {};
  a.callback = cb;
  a.name = "t";
  esp_timer_handle_t h;
  esp_timer_create(&a, &h);
}
void loop() {}
