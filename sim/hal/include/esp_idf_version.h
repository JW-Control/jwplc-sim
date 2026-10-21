// Versión de ESP-IDF de esp32-arduino-libs para arduino-esp32 3.3.x.
#pragma once
#define ESP_IDF_VERSION_MAJOR 5
#define ESP_IDF_VERSION_MINOR 5
#define ESP_IDF_VERSION_PATCH 1
#define ESP_IDF_VERSION_VAL(major, minor, patch) (((major) << 16) | ((minor) << 8) | (patch))
#define ESP_IDF_VERSION ESP_IDF_VERSION_VAL(ESP_IDF_VERSION_MAJOR, ESP_IDF_VERSION_MINOR, ESP_IDF_VERSION_PATCH)
#ifdef __cplusplus
extern "C" {
#endif
const char *esp_get_idf_version(void);
#ifdef __cplusplus
}
#endif
