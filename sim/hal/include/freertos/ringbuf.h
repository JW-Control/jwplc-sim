#pragma once
#include <stddef.h>
#include <stdlib.h>  // newlib lo expone de forma transitiva; cbuf.cpp depende de ello
#include "freertos/FreeRTOS.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct jwsim_ringbuf *RingbufHandle_t;
typedef enum { RINGBUF_TYPE_NOSPLIT = 0, RINGBUF_TYPE_ALLOWSPLIT, RINGBUF_TYPE_BYTEBUF, RINGBUF_TYPE_MAX } RingbufferType_t;
RingbufHandle_t xRingbufferCreate(size_t xBufferSize, RingbufferType_t xBufferType);
void vRingbufferDelete(RingbufHandle_t xRingbuffer);
BaseType_t xRingbufferSend(RingbufHandle_t xRingbuffer, const void *pvItem, size_t xItemSize, TickType_t xTicksToWait);
void *xRingbufferReceiveUpTo(RingbufHandle_t xRingbuffer, size_t *pxItemSize, TickType_t xTicksToWait, size_t xMaxSize);
void vRingbufferReturnItem(RingbufHandle_t xRingbuffer, void *pvItem);
size_t xRingbufferGetMaxItemSize(RingbufHandle_t xRingbuffer);
size_t xRingbufferGetCurFreeSize(RingbufHandle_t xRingbuffer);
void vRingbufferGetInfo(RingbufHandle_t xRingbuffer, UBaseType_t *uxFree, UBaseType_t *uxRead, UBaseType_t *uxWrite,
                        UBaseType_t *uxAcquire, UBaseType_t *uxItemsWaiting);
#ifdef __cplusplus
}
#endif
