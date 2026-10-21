// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
// Generador pseudoaleatorio determinista sembrado por el proyecto .jwsim.
uint32_t esp_random(void);
void esp_fill_random(void *buf, size_t len);
#ifdef __cplusplus
}
#endif
