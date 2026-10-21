#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
int ets_printf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
void ets_delay_us(uint32_t us);
#ifdef __cplusplus
}
#endif
