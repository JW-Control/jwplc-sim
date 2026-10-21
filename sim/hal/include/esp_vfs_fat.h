// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Subset de esp_vfs_fat.h (ESP-IDF). La integración VFS (rutas "/sd/..." hacia
// FatFs) la implementa el HAL nativo; ver ARCHITECTURE.md §6 (SD_DATALOG, G4).
#pragma once
#include <stddef.h>
#include "esp_err.h"
#include "ff.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
  const char *base_path;
  const char *fat_drive;
  size_t max_files;
} esp_vfs_fat_conf_t;
esp_err_t esp_vfs_fat_register_cfg(const esp_vfs_fat_conf_t *conf, FATFS **out_fs);
esp_err_t esp_vfs_fat_register(const char *base_path, const char *fat_drive, size_t max_files, FATFS **out_fs);
esp_err_t esp_vfs_fat_unregister_path(const char *base_path);
#ifdef __cplusplus
}
#endif
