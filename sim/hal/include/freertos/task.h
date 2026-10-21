#pragma once

#include "freertos/FreeRTOS.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct jwsim_task *TaskHandle_t;
typedef void (*TaskFunction_t)(void *);
typedef struct { uint8_t opaque[64]; } StaticTask_t;

typedef enum { eRunning = 0, eReady, eBlocked, eSuspended, eDeleted, eInvalid } eTaskState;
typedef enum { eNoAction = 0, eSetBits, eIncrement, eSetValueWithOverwrite, eSetValueWithoutOverwrite } eNotifyAction;

typedef struct {
  TaskHandle_t xHandle;
  const char *pcTaskName;
  UBaseType_t xTaskNumber;
  eTaskState eCurrentState;
  UBaseType_t uxCurrentPriority;
  UBaseType_t uxBasePriority;
  uint32_t ulRunTimeCounter;
  StackType_t *pxStackBase;
  uint32_t usStackHighWaterMark;
  BaseType_t xCoreID;
} TaskStatus_t;

#define tskIDLE_PRIORITY ((UBaseType_t)0U)
#define taskYIELD() portYIELD()
#define taskDISABLE_INTERRUPTS() portDISABLE_INTERRUPTS()
#define taskENABLE_INTERRUPTS() portENABLE_INTERRUPTS()
#define taskSCHEDULER_SUSPENDED ((BaseType_t)0)
#define taskSCHEDULER_NOT_STARTED ((BaseType_t)1)
#define taskSCHEDULER_RUNNING ((BaseType_t)2)

BaseType_t xTaskCreatePinnedToCore(TaskFunction_t fn, const char *name, uint32_t stackDepth,
                                   void *param, UBaseType_t prio, TaskHandle_t *created,
                                   BaseType_t coreId);
static inline BaseType_t xTaskCreate(TaskFunction_t fn, const char *name, uint32_t stackDepth,
                                     void *param, UBaseType_t prio, TaskHandle_t *created) {
  return xTaskCreatePinnedToCore(fn, name, stackDepth, param, prio, created, tskNO_AFFINITY);
}
TaskHandle_t xTaskCreateStaticPinnedToCore(TaskFunction_t fn, const char *name, uint32_t stackDepth,
                                           void *param, UBaseType_t prio, StackType_t *stack,
                                           StaticTask_t *tcb, BaseType_t coreId);
static inline TaskHandle_t xTaskCreateStatic(TaskFunction_t fn, const char *name, uint32_t stackDepth,
                                             void *param, UBaseType_t prio, StackType_t *stack,
                                             StaticTask_t *tcb) {
  return xTaskCreateStaticPinnedToCore(fn, name, stackDepth, param, prio, stack, tcb, tskNO_AFFINITY);
}
void vTaskDelete(TaskHandle_t task);
void vTaskDelay(const TickType_t ticks);
void vTaskDelayUntil(TickType_t *previousWakeTime, const TickType_t increment);
BaseType_t xTaskDelayUntil(TickType_t *previousWakeTime, const TickType_t increment);
TickType_t xTaskGetTickCount(void);
TickType_t xTaskGetTickCountFromISR(void);
TaskHandle_t xTaskGetCurrentTaskHandle(void);
TaskHandle_t xTaskGetCurrentTaskHandleForCore(BaseType_t core);
TaskHandle_t xTaskGetIdleTaskHandleForCore(BaseType_t core);
TaskHandle_t xTaskGetHandle(const char *name);
char *pcTaskGetName(TaskHandle_t task);
#define pcTaskGetTaskName pcTaskGetName
UBaseType_t uxTaskPriorityGet(TaskHandle_t task);
void vTaskPrioritySet(TaskHandle_t task, UBaseType_t prio);
BaseType_t xTaskGetCoreID(TaskHandle_t task);
#define xTaskGetAffinity xTaskGetCoreID
eTaskState eTaskGetState(TaskHandle_t task);
UBaseType_t uxTaskGetStackHighWaterMark(TaskHandle_t task);
UBaseType_t uxTaskGetNumberOfTasks(void);
UBaseType_t uxTaskGetSystemState(TaskStatus_t *array, UBaseType_t size, uint32_t *totalRunTime);
void vTaskSuspend(TaskHandle_t task);
void vTaskResume(TaskHandle_t task);
BaseType_t xTaskResumeFromISR(TaskHandle_t task);
void vTaskSuspendAll(void);
BaseType_t xTaskResumeAll(void);
BaseType_t xTaskGetSchedulerState(void);
void vTaskStartScheduler(void);

BaseType_t xTaskGenericNotify(TaskHandle_t task, UBaseType_t index, uint32_t value,
                              eNotifyAction action, uint32_t *prev);
BaseType_t xTaskGenericNotifyFromISR(TaskHandle_t task, UBaseType_t index, uint32_t value,
                                     eNotifyAction action, uint32_t *prev, BaseType_t *woken);
BaseType_t xTaskGenericNotifyWait(UBaseType_t index, uint32_t clearOnEntry, uint32_t clearOnExit,
                                  uint32_t *value, TickType_t ticks);
uint32_t ulTaskGenericNotifyTake(UBaseType_t index, BaseType_t clearOnExit, TickType_t ticks);
void vTaskGenericNotifyGiveFromISR(TaskHandle_t task, UBaseType_t index, BaseType_t *woken);

#define xTaskNotify(t, v, a) xTaskGenericNotify((t), 0, (v), (a), NULL)
#define xTaskNotifyAndQuery(t, v, a, p) xTaskGenericNotify((t), 0, (v), (a), (p))
#define xTaskNotifyFromISR(t, v, a, w) xTaskGenericNotifyFromISR((t), 0, (v), (a), NULL, (w))
#define xTaskNotifyGive(t) xTaskGenericNotify((t), 0, 0, eIncrement, NULL)
#define vTaskNotifyGiveFromISR(t, w) vTaskGenericNotifyGiveFromISR((t), 0, (w))
#define xTaskNotifyWait(e, x, v, t) xTaskGenericNotifyWait(0, (e), (x), (v), (t))
#define ulTaskNotifyTake(c, t) ulTaskGenericNotifyTake(0, (c), (t))

#ifdef __cplusplus
}
#endif
