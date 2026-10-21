#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef uint32_t esp_cpu_cycle_count_t;
// Ciclos virtuales: tiempo virtual del núcleo actual × 240 MHz.
esp_cpu_cycle_count_t esp_cpu_get_cycle_count(void);
int esp_cpu_get_core_id(void);
#ifdef __cplusplus
}
#endif
