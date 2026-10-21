// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Subset de driver/gpio.h (ESP-IDF). La implementación nativa mantiene una
// tabla de los 40 GPIO del ESP32 conectada a la placa virtual.
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "soc/soc_caps.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef enum {
  GPIO_NUM_NC = -1,
  GPIO_NUM_0 = 0, GPIO_NUM_1, GPIO_NUM_2, GPIO_NUM_3, GPIO_NUM_4, GPIO_NUM_5, GPIO_NUM_6, GPIO_NUM_7,
  GPIO_NUM_8, GPIO_NUM_9, GPIO_NUM_10, GPIO_NUM_11, GPIO_NUM_12, GPIO_NUM_13, GPIO_NUM_14, GPIO_NUM_15,
  GPIO_NUM_16, GPIO_NUM_17, GPIO_NUM_18, GPIO_NUM_19, GPIO_NUM_20, GPIO_NUM_21, GPIO_NUM_22, GPIO_NUM_23,
  GPIO_NUM_25 = 25, GPIO_NUM_26, GPIO_NUM_27,
  GPIO_NUM_32 = 32, GPIO_NUM_33, GPIO_NUM_34, GPIO_NUM_35, GPIO_NUM_36, GPIO_NUM_37, GPIO_NUM_38, GPIO_NUM_39,
  GPIO_NUM_MAX,
} gpio_num_t;

#define GPIO_MODE_DEF_DISABLE (0)
#define GPIO_MODE_DEF_INPUT (1u << 0)
#define GPIO_MODE_DEF_OUTPUT (1u << 1)
#define GPIO_MODE_DEF_OD (1u << 2)

typedef enum {
  GPIO_MODE_DISABLE = GPIO_MODE_DEF_DISABLE,
  GPIO_MODE_INPUT = GPIO_MODE_DEF_INPUT,
  GPIO_MODE_OUTPUT = GPIO_MODE_DEF_OUTPUT,
  GPIO_MODE_OUTPUT_OD = (GPIO_MODE_DEF_OUTPUT | GPIO_MODE_DEF_OD),
  GPIO_MODE_INPUT_OUTPUT_OD = (GPIO_MODE_DEF_INPUT | GPIO_MODE_DEF_OUTPUT | GPIO_MODE_DEF_OD),
  GPIO_MODE_INPUT_OUTPUT = (GPIO_MODE_DEF_INPUT | GPIO_MODE_DEF_OUTPUT),
} gpio_mode_t;
typedef enum { GPIO_PULLUP_DISABLE = 0, GPIO_PULLUP_ENABLE = 1 } gpio_pullup_t;
typedef enum { GPIO_PULLDOWN_DISABLE = 0, GPIO_PULLDOWN_ENABLE = 1 } gpio_pulldown_t;
typedef enum { GPIO_PULLUP_ONLY, GPIO_PULLDOWN_ONLY, GPIO_PULLUP_PULLDOWN, GPIO_FLOATING } gpio_pull_mode_t;
typedef enum {
  GPIO_INTR_DISABLE = 0,
  GPIO_INTR_POSEDGE = 1,
  GPIO_INTR_NEGEDGE = 2,
  GPIO_INTR_ANYEDGE = 3,
  GPIO_INTR_LOW_LEVEL = 4,
  GPIO_INTR_HIGH_LEVEL = 5,
  GPIO_INTR_MAX,
} gpio_int_type_t;
typedef enum { GPIO_DRIVE_CAP_0 = 0, GPIO_DRIVE_CAP_1, GPIO_DRIVE_CAP_2, GPIO_DRIVE_CAP_DEFAULT = 2, GPIO_DRIVE_CAP_3 } gpio_drive_cap_t;
typedef struct {
  uint64_t pin_bit_mask;
  gpio_mode_t mode;
  gpio_pullup_t pull_up_en;
  gpio_pulldown_t pull_down_en;
  gpio_int_type_t intr_type;
} gpio_config_t;
typedef void (*gpio_isr_t)(void *arg);

#define GPIO_IS_VALID_GPIO(n) ((n) >= 0 && (n) < SOC_GPIO_PIN_COUNT && ((SOC_GPIO_VALID_GPIO_MASK >> (n)) & 1))
#define GPIO_IS_VALID_OUTPUT_GPIO(n) (GPIO_IS_VALID_GPIO(n) && (n) < 34)
#define RTC_GPIO_IS_VALID_GPIO(n) (0)

esp_err_t gpio_config(const gpio_config_t *cfg);
esp_err_t gpio_reset_pin(gpio_num_t gpio_num);
esp_err_t gpio_set_level(gpio_num_t gpio_num, uint32_t level);
int gpio_get_level(gpio_num_t gpio_num);
esp_err_t gpio_set_direction(gpio_num_t gpio_num, gpio_mode_t mode);
esp_err_t gpio_set_pull_mode(gpio_num_t gpio_num, gpio_pull_mode_t pull);
esp_err_t gpio_pullup_en(gpio_num_t gpio_num);
esp_err_t gpio_pullup_dis(gpio_num_t gpio_num);
esp_err_t gpio_pulldown_en(gpio_num_t gpio_num);
esp_err_t gpio_pulldown_dis(gpio_num_t gpio_num);
esp_err_t gpio_set_intr_type(gpio_num_t gpio_num, gpio_int_type_t intr_type);
esp_err_t gpio_intr_enable(gpio_num_t gpio_num);
esp_err_t gpio_intr_disable(gpio_num_t gpio_num);
esp_err_t gpio_install_isr_service(int intr_alloc_flags);
void gpio_uninstall_isr_service(void);
esp_err_t gpio_isr_handler_add(gpio_num_t gpio_num, gpio_isr_t isr_handler, void *args);
esp_err_t gpio_isr_handler_remove(gpio_num_t gpio_num);
esp_err_t gpio_set_drive_capability(gpio_num_t gpio_num, gpio_drive_cap_t strength);
esp_err_t gpio_wakeup_enable(gpio_num_t gpio_num, gpio_int_type_t intr_type);
esp_err_t gpio_wakeup_disable(gpio_num_t gpio_num);
#ifdef __cplusplus
}
#endif
