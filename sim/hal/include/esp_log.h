// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <stdarg.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum { ESP_LOG_NONE, ESP_LOG_ERROR, ESP_LOG_WARN, ESP_LOG_INFO, ESP_LOG_DEBUG, ESP_LOG_VERBOSE } esp_log_level_t;

void esp_log_write(esp_log_level_t level, const char *tag, const char *format, ...) __attribute__((format(printf, 3, 4)));
void esp_log_writev(esp_log_level_t level, const char *tag, const char *format, va_list args);
void esp_log_level_set(const char *tag, esp_log_level_t level);
uint32_t esp_log_timestamp(void);

#define ESP_LOGE(tag, fmt, ...) esp_log_write(ESP_LOG_ERROR, tag, fmt, ##__VA_ARGS__)
#define ESP_LOGW(tag, fmt, ...) esp_log_write(ESP_LOG_WARN, tag, fmt, ##__VA_ARGS__)
#define ESP_LOGI(tag, fmt, ...) esp_log_write(ESP_LOG_INFO, tag, fmt, ##__VA_ARGS__)
#define ESP_LOGD(tag, fmt, ...) ((void)0)
#define ESP_LOGV(tag, fmt, ...) ((void)0)
#define ESP_EARLY_LOGE ESP_LOGE
#define ESP_EARLY_LOGW ESP_LOGW
#define ESP_EARLY_LOGI ESP_LOGI
#define ESP_EARLY_LOGD ESP_LOGD
#define ESP_EARLY_LOGV ESP_LOGV
#define ESP_DRAM_LOGE ESP_LOGE

#ifdef __cplusplus
}
#endif
