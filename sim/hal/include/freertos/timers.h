// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Timers de software de FreeRTOS (API de timers.h de FreeRTOS V10.5).
#pragma once

#include "freertos/task.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct jwsim_rtos_timer *TimerHandle_t;
typedef void (*TimerCallbackFunction_t)(TimerHandle_t);
typedef void (*PendedFunction_t)(void *, uint32_t);

// Espacio para un timer estático (xTimerCreateStatic).
typedef struct {
  void *pvDummy[16];
} StaticTimer_t;

#define tmrCOMMAND_EXECUTE_CALLBACK_FROM_ISR ((BaseType_t)-2)
#define tmrCOMMAND_EXECUTE_CALLBACK ((BaseType_t)-1)
#define tmrCOMMAND_START_DONT_TRACE ((BaseType_t)0)
#define tmrCOMMAND_START ((BaseType_t)1)
#define tmrCOMMAND_RESET ((BaseType_t)2)
#define tmrCOMMAND_STOP ((BaseType_t)3)
#define tmrCOMMAND_CHANGE_PERIOD ((BaseType_t)4)
#define tmrCOMMAND_DELETE ((BaseType_t)5)
#define tmrFIRST_FROM_ISR_COMMAND ((BaseType_t)6)
#define tmrCOMMAND_START_FROM_ISR ((BaseType_t)6)
#define tmrCOMMAND_RESET_FROM_ISR ((BaseType_t)7)
#define tmrCOMMAND_STOP_FROM_ISR ((BaseType_t)8)
#define tmrCOMMAND_CHANGE_PERIOD_FROM_ISR ((BaseType_t)9)

TimerHandle_t xTimerCreate(const char *name, TickType_t period, UBaseType_t autoReload, void *id,
                           TimerCallbackFunction_t cb);
TimerHandle_t xTimerCreateStatic(const char *name, TickType_t period, UBaseType_t autoReload, void *id,
                                 TimerCallbackFunction_t cb, StaticTimer_t *buffer);
BaseType_t xTimerGenericCommand(TimerHandle_t t, BaseType_t command, TickType_t value, BaseType_t *woken,
                                TickType_t ticks);

#define xTimerStart(t, ticks) xTimerGenericCommand((t), tmrCOMMAND_START, xTaskGetTickCount(), NULL, (ticks))
#define xTimerStop(t, ticks) xTimerGenericCommand((t), tmrCOMMAND_STOP, 0U, NULL, (ticks))
#define xTimerChangePeriod(t, period, ticks) xTimerGenericCommand((t), tmrCOMMAND_CHANGE_PERIOD, (period), NULL, (ticks))
#define xTimerDelete(t, ticks) xTimerGenericCommand((t), tmrCOMMAND_DELETE, 0U, NULL, (ticks))
#define xTimerReset(t, ticks) xTimerGenericCommand((t), tmrCOMMAND_RESET, xTaskGetTickCount(), NULL, (ticks))
#define xTimerStartFromISR(t, woken) \
  xTimerGenericCommand((t), tmrCOMMAND_START_FROM_ISR, xTaskGetTickCountFromISR(), (woken), 0U)
#define xTimerStopFromISR(t, woken) xTimerGenericCommand((t), tmrCOMMAND_STOP_FROM_ISR, 0, (woken), 0U)
#define xTimerChangePeriodFromISR(t, period, woken) \
  xTimerGenericCommand((t), tmrCOMMAND_CHANGE_PERIOD_FROM_ISR, (period), (woken), 0U)
#define xTimerResetFromISR(t, woken) \
  xTimerGenericCommand((t), tmrCOMMAND_RESET_FROM_ISR, xTaskGetTickCountFromISR(), (woken), 0U)

BaseType_t xTimerIsTimerActive(TimerHandle_t t);
void *pvTimerGetTimerID(TimerHandle_t t);
void vTimerSetTimerID(TimerHandle_t t, void *id);
const char *pcTimerGetName(TimerHandle_t t);
TickType_t xTimerGetPeriod(TimerHandle_t t);
TickType_t xTimerGetExpiryTime(TimerHandle_t t);
void vTimerSetReloadMode(TimerHandle_t t, BaseType_t reload);
BaseType_t xTimerGetReloadMode(TimerHandle_t t);
UBaseType_t uxTimerGetReloadMode(TimerHandle_t t);
TaskHandle_t xTimerGetTimerDaemonTaskHandle(void);
BaseType_t xTimerPendFunctionCall(PendedFunction_t fn, void *p1, uint32_t p2, TickType_t ticks);
BaseType_t xTimerPendFunctionCallFromISR(PendedFunction_t fn, void *p1, uint32_t p2, BaseType_t *woken);

#ifdef __cplusplus
}
#endif
