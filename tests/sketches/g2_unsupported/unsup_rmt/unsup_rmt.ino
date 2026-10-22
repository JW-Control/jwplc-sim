// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G2_UNSUPPORTED_LIB_MSG: xTimerCreate (timers de FreeRTOS)
#include <freertos/timers.h>
static void cb(TimerHandle_t) {}
void setup() { xTimerCreate("t", pdMS_TO_TICKS(100), pdTRUE, nullptr, cb); }
void loop() {}
