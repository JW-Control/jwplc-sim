// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// settimeofday() como en newlib (MinGW no la declara). El símbolo se enruta
// a la hora del simulador (sim/hal/src/systime.cpp, fw-libc.syms).
#pragma once
#include_next <sys/time.h>
#ifdef __cplusplus
extern "C" {
#endif
int settimeofday(const struct timeval *tv, const void *tz);
#ifdef __cplusplus
}
#endif
