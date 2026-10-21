// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Registro VFS de FatFs (esp_vfs_fat_register). El montaje y las operaciones
// FatFs son las reales de ESP-IDF; lo que falta es enrutar fopen("/sd/...")
// de vfs_api.cpp hacia FatFs, que se implementa en G4 (SD_DATALOG).
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>

#include "esp_vfs_fat.h"

namespace {
// Contextos por ruta base. NO se liberan al desregistrar: la librería SD del
// package (heredada de arduino-esp32) llama f_mount(NULL, drv, 0) DESPUÉS de
// esp_vfs_fat_unregister_path() cuando el montaje falla (SDFS::begin ->
// sdcard_mount falla -> sdcard_unmount), y FatFs escribe fs_type = 0 en el
// FATFS ya liberado. En el ESP32 ese byte cae dentro del bloque liberado de
// vfs_fat_ctx_t (benigno); en el host corrompería el heap. Se retiene el
// bloque y se reutiliza para la misma ruta. Ver docs/ARCHITECTURE.md §10.
struct Ctx {
  FATFS *fs = nullptr;
  bool active = false;
};
std::map<std::string, Ctx> g_mounts;
}

extern "C" {

esp_err_t esp_vfs_fat_register_cfg(const esp_vfs_fat_conf_t *conf, FATFS **out_fs) {
  if (!conf || !conf->base_path) return ESP_ERR_INVALID_ARG;
  Ctx &ctx = g_mounts[conf->base_path];
  if (ctx.active) return ESP_ERR_INVALID_STATE;
  if (!ctx.fs) ctx.fs = static_cast<FATFS *>(std::calloc(1, sizeof(FATFS)));
  if (!ctx.fs) return ESP_ERR_NO_MEM;
  std::memset(ctx.fs, 0, sizeof(FATFS));
  ctx.active = true;
  if (out_fs) *out_fs = ctx.fs;
  return ESP_OK;
}

esp_err_t esp_vfs_fat_register(const char *base_path, const char *fat_drive, size_t max_files, FATFS **out_fs) {
  const esp_vfs_fat_conf_t conf = {base_path, fat_drive, max_files};
  return esp_vfs_fat_register_cfg(&conf, out_fs);
}

esp_err_t esp_vfs_fat_unregister_path(const char *base_path) {
  auto it = g_mounts.find(base_path ? base_path : "");
  if (it == g_mounts.end() || !it->second.active) return ESP_ERR_INVALID_STATE;
  it->second.active = false;
  return ESP_OK;
}

} // extern "C"
