#pragma once

#include "freertos/task.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct jwsim_rtos_timer *TimerHandle_t;
typedef void (*TimerCallbackFunction_t)(TimerHandle_t);

TimerHandle_t xTimerCreate(const char *name, TickType_t period, UBaseType_t autoReload, void *id,
                           TimerCallbackFunction_t cb);
BaseType_t xTimerStart(TimerHandle_t t, TickType_t ticks);
BaseType_t xTimerStop(TimerHandle_t t, TickType_t ticks);
BaseType_t xTimerReset(TimerHandle_t t, TickType_t ticks);
BaseType_t xTimerChangePeriod(TimerHandle_t t, TickType_t period, TickType_t ticks);
BaseType_t xTimerDelete(TimerHandle_t t, TickType_t ticks);
BaseType_t xTimerIsTimerActive(TimerHandle_t t);
void *pvTimerGetTimerID(TimerHandle_t t);

#ifdef __cplusplus
}
#endif
