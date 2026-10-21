// Capacidades del SoC ESP32 (subset de esp-idf/components/soc/esp32/include/
// soc/soc_caps.h) que consultan el core JWPLC y sus librerías. Solo se
// declaran periféricos que el HAL de JWPLC Sim implementa o rechaza con un
// mensaje explícito; los demás quedan sin definir y su API no existe.
#pragma once

#define SOC_CPU_CORES_NUM 2
#define SOC_GPIO_PIN_COUNT 40
#define SOC_GPIO_VALID_GPIO_MASK (0xFFFFFFFFFFULL & ~(0ULL | (1ULL << 20) | (1ULL << 24) | (1ULL << 28) | (1ULL << 29) | (1ULL << 30) | (1ULL << 31)))
#define SOC_RTCIO_PIN_COUNT 18

#define SOC_UART_SUPPORTED 1
#define SOC_UART_NUM 3
#define SOC_UART_HP_NUM 3
#define SOC_UART_LP_NUM 0
#define SOC_UART_FIFO_LEN 128
#define SOC_UART_SUPPORT_APB_CLK 1
#define SOC_UART_SUPPORT_REF_TICK 1
#define SOC_UART_TX_PIN_IDX 0
#define SOC_UART_RX_PIN_IDX 1
#define SOC_UART_RTS_PIN_IDX 2
#define SOC_UART_CTS_PIN_IDX 3
#define SOC_RX0 3
#define SOC_TX0 1
#define SOC_RX1 9
#define SOC_TX1 10
#define SOC_RX2 16
#define SOC_TX2 17

#define SOC_I2C_SUPPORTED 1
#define SOC_I2C_NUM 2
#define SOC_HP_I2C_NUM 2
#define SOC_I2C_FIFO_LEN 32
#define SOC_I2C_SUPPORT_SLAVE 1
#define SOC_I2C_SUPPORT_APB 1

#define SOC_GPSPI_SUPPORTED 1
#define SOC_SPI_PERIPH_NUM 3

#define SOC_ADC_SUPPORTED 1
#define SOC_ADC_PERIPH_NUM 2
#define SOC_ADC_MAX_CHANNEL_NUM 10
#define SOC_ADC_CHANNEL_NUM(PERIPH_NUM) ((PERIPH_NUM == 0) ? 8 : 10)
#define SOC_ADC_RTC_MIN_BITWIDTH 9
#define SOC_ADC_RTC_MAX_BITWIDTH 12

#define SOC_DAC_SUPPORTED 1
#define SOC_TOUCH_SENSOR_NUM 10
