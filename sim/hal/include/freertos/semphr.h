// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include "freertos/queue.h"
#include "freertos/task.h"

#ifdef __cplusplus
extern "C" {
#endif

// Semáforos y mutex como colas sin datos (igual que FreeRTOS). Los mutex
// registran dueño y nivel de recursión; no hay herencia de prioridad (límite
// de fidelidad documentado en ARCHITECTURE.md).
typedef QueueHandle_t SemaphoreHandle_t;
typedef StaticQueue_t StaticSemaphore_t;

SemaphoreHandle_t xSemaphoreCreateBinary(void);
SemaphoreHandle_t xSemaphoreCreateBinaryStatic(StaticSemaphore_t *buffer);
SemaphoreHandle_t xSemaphoreCreateCounting(UBaseType_t max, UBaseType_t initial);
SemaphoreHandle_t xSemaphoreCreateCountingStatic(UBaseType_t max, UBaseType_t initial, StaticSemaphore_t *buffer);
SemaphoreHandle_t xSemaphoreCreateMutex(void);
SemaphoreHandle_t xSemaphoreCreateMutexStatic(StaticSemaphore_t *buffer);
SemaphoreHandle_t xSemaphoreCreateRecursiveMutex(void);
SemaphoreHandle_t xSemaphoreCreateRecursiveMutexStatic(StaticSemaphore_t *buffer);
BaseType_t xSemaphoreTake(SemaphoreHandle_t s, TickType_t ticks);
BaseType_t xSemaphoreGive(SemaphoreHandle_t s);
BaseType_t xSemaphoreTakeRecursive(SemaphoreHandle_t s, TickType_t ticks);
BaseType_t xSemaphoreGiveRecursive(SemaphoreHandle_t s);
BaseType_t xSemaphoreTakeFromISR(SemaphoreHandle_t s, BaseType_t *woken);
BaseType_t xSemaphoreGiveFromISR(SemaphoreHandle_t s, BaseType_t *woken);
UBaseType_t uxSemaphoreGetCount(SemaphoreHandle_t s);
TaskHandle_t xSemaphoreGetMutexHolder(SemaphoreHandle_t s);
#define vSemaphoreDelete(s) vQueueDelete((QueueHandle_t)(s))

#ifdef __cplusplus
}
#endif
