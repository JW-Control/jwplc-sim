// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto de FreeRTOS (ESP-IDF) para JWPLC Sim. Las tareas y primitivas se
// implementan sobre el planificador determinista del motor (jwsim/engine.h).
// Solo se declara la API que usan el core y las librerías del package; lo que
// falte debe agregarse aquí, nunca parchando el package.
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#include "sdkconfig.h"
#include "freertos/portmacro.h"

#define configTICK_RATE_HZ CONFIG_FREERTOS_HZ
#define configMAX_PRIORITIES 25
#define configMINIMAL_STACK_SIZE 768
#define configUSE_PREEMPTION 1
#define configUSE_TIME_SLICING 1
#define configNUMBER_OF_CORES 2
#define configMAX_TASK_NAME_LEN 16
#define configSUPPORT_STATIC_ALLOCATION 1
#define configSUPPORT_DYNAMIC_ALLOCATION 1
#define configASSERT(x) ((x) ? (void)0 : jwsim_freertos_assert(__FILE__, __LINE__))

#define pdFALSE ((BaseType_t)0)
#define pdTRUE ((BaseType_t)1)
#define pdPASS (pdTRUE)
#define pdFAIL (pdFALSE)
#define errQUEUE_EMPTY ((BaseType_t)0)
#define errQUEUE_FULL ((BaseType_t)0)
#define errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY (-1)

#define pdMS_TO_TICKS(xTimeInMs) ((TickType_t)(((uint64_t)(xTimeInMs) * (uint64_t)configTICK_RATE_HZ) / 1000ULL))
#define pdTICKS_TO_MS(xTicks) ((uint32_t)(((uint64_t)(xTicks) * 1000ULL) / (uint64_t)configTICK_RATE_HZ))

#ifdef __cplusplus
extern "C" {
#endif
void jwsim_freertos_assert(const char *file, int line);
#ifdef __cplusplus
}
#endif
