#pragma once

#include "freertos/FreeRTOS.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct jwsim_event_group *EventGroupHandle_t;
typedef TickType_t EventBits_t;
typedef struct { uint8_t opaque[32]; } StaticEventGroup_t;

EventGroupHandle_t xEventGroupCreate(void);
EventGroupHandle_t xEventGroupCreateStatic(StaticEventGroup_t *buffer);
void vEventGroupDelete(EventGroupHandle_t g);
EventBits_t xEventGroupSetBits(EventGroupHandle_t g, const EventBits_t bits);
EventBits_t xEventGroupClearBits(EventGroupHandle_t g, const EventBits_t bits);
EventBits_t xEventGroupGetBits(EventGroupHandle_t g);
EventBits_t xEventGroupWaitBits(EventGroupHandle_t g, const EventBits_t bits, const BaseType_t clearOnExit,
                                const BaseType_t waitAll, TickType_t ticks);
BaseType_t xEventGroupSetBitsFromISR(EventGroupHandle_t g, const EventBits_t bits, BaseType_t *woken);
#define xEventGroupClearBitsFromISR(g, b) xEventGroupClearBits((g), (b))
#define xEventGroupGetBitsFromISR(g) xEventGroupGetBits(g)

#ifdef __cplusplus
}
#endif
