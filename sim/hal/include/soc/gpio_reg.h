// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Direcciones de registros GPIO del ESP32. Arduino.h solo las usa en macros
// (portOutputRegister...). El acceso directo a estos registros NO está
// soportado por el HAL nativo (ver ARCHITECTURE.md, límites de fidelidad).
#pragma once
#define DR_REG_GPIO_BASE 0x3ff44000
#define GPIO_OUT_REG (DR_REG_GPIO_BASE + 0x0004)
#define GPIO_OUT_W1TS_REG (DR_REG_GPIO_BASE + 0x0008)
#define GPIO_OUT_W1TC_REG (DR_REG_GPIO_BASE + 0x000c)
#define GPIO_OUT1_REG (DR_REG_GPIO_BASE + 0x0010)
#define GPIO_ENABLE_REG (DR_REG_GPIO_BASE + 0x0020)
#define GPIO_ENABLE1_REG (DR_REG_GPIO_BASE + 0x002c)
#define GPIO_IN_REG (DR_REG_GPIO_BASE + 0x003c)
#define GPIO_IN1_REG (DR_REG_GPIO_BASE + 0x0040)
