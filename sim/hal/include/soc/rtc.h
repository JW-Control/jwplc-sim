#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef enum { RTC_XTAL_FREQ_AUTO = 0, RTC_XTAL_FREQ_24M = 24, RTC_XTAL_FREQ_26M = 26, RTC_XTAL_FREQ_40M = 40 } rtc_xtal_freq_t;
void rtc_clk_xtal_freq_update(rtc_xtal_freq_t xtal_freq);
void rtc_clk_cpu_freq_set_xtal(void);
uint32_t rtc_clk_apb_freq_get(void);
#ifdef __cplusplus
}
#endif
