// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "esp_cpu.h"
#define cpu_hal_get_cycle_count() esp_cpu_get_cycle_count()
#define cpu_hal_get_core_id() esp_cpu_get_core_id()
