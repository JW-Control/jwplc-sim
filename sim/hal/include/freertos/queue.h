#pragma once

#include "freertos/FreeRTOS.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct jwsim_queue *QueueHandle_t;
typedef QueueHandle_t QueueSetHandle_t;
typedef QueueHandle_t QueueSetMemberHandle_t;
typedef struct { uint8_t opaque[96]; } StaticQueue_t;

#define queueSEND_TO_BACK ((BaseType_t)0)
#define queueSEND_TO_FRONT ((BaseType_t)1)
#define queueOVERWRITE ((BaseType_t)2)

QueueHandle_t xQueueCreate(UBaseType_t length, UBaseType_t itemSize);
QueueHandle_t xQueueCreateStatic(UBaseType_t length, UBaseType_t itemSize, uint8_t *storage,
                                 StaticQueue_t *buffer);
void vQueueDelete(QueueHandle_t q);
BaseType_t xQueueGenericSend(QueueHandle_t q, const void *item, TickType_t ticks, BaseType_t pos);
BaseType_t xQueueGenericSendFromISR(QueueHandle_t q, const void *item, BaseType_t *woken, BaseType_t pos);
BaseType_t xQueueReceive(QueueHandle_t q, void *item, TickType_t ticks);
BaseType_t xQueueReceiveFromISR(QueueHandle_t q, void *item, BaseType_t *woken);
BaseType_t xQueuePeek(QueueHandle_t q, void *item, TickType_t ticks);
BaseType_t xQueueGenericReset(QueueHandle_t q, BaseType_t newQueue);
UBaseType_t uxQueueMessagesWaiting(QueueHandle_t q);
UBaseType_t uxQueueMessagesWaitingFromISR(QueueHandle_t q);
UBaseType_t uxQueueSpacesAvailable(QueueHandle_t q);

#define xQueueSend(q, i, t) xQueueGenericSend((q), (i), (t), queueSEND_TO_BACK)
#define xQueueSendToBack(q, i, t) xQueueGenericSend((q), (i), (t), queueSEND_TO_BACK)
#define xQueueSendToFront(q, i, t) xQueueGenericSend((q), (i), (t), queueSEND_TO_FRONT)
#define xQueueOverwrite(q, i) xQueueGenericSend((q), (i), 0, queueOVERWRITE)
#define xQueueSendFromISR(q, i, w) xQueueGenericSendFromISR((q), (i), (w), queueSEND_TO_BACK)
#define xQueueSendToBackFromISR(q, i, w) xQueueGenericSendFromISR((q), (i), (w), queueSEND_TO_BACK)
#define xQueueOverwriteFromISR(q, i, w) xQueueGenericSendFromISR((q), (i), (w), queueOVERWRITE)
#define xQueueReset(q) xQueueGenericReset((q), pdFALSE)

#ifdef __cplusplus
}
#endif
