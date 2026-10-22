// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// NVS de ESP-IDF sobre un almacén del simulador (gate JWSIM_G4_NVS_PREFERENCES).
//
// Semántica de ESP-IDF v5 que usan Preferences y EEPROM: entradas tipadas
// por (partición, namespace, clave, tipo) — una clave con otro tipo no se
// encuentra —; claves y namespaces de hasta 15 caracteres; cadenas de hasta
// 4000 bytes; lecturas de cadena/blob con consulta de longitud (puntero
// nulo) y ESP_ERR_NVS_INVALID_LENGTH si el buffer no alcanza; handles de solo
// lectura; abrir en solo lectura un namespace inexistente da NOT_FOUND. La
// partición "nvs" (20 KiB, 5 páginas de 126 entradas como la del core) está
// inicializada desde el arranque, como hace initArduino().
//
// Las escrituras son inmediatas (nvs_commit no hace nada, igual que en
// ESP-IDF); el archivo nvs.bin del directorio de estado se escribe en cada
// save del runner.
#include <cstring>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <vector>

#include "jwsim/engine.h"
#include "jwsim/models/persist.h"
#include "nvs.h"
#include "nvs_flash.h"

namespace {

constexpr size_t kEntriesPerPage = 126;
constexpr size_t kPages = 5;             // partición "nvs" de 0x5000 bytes
constexpr size_t kMaxStr = 4000;

struct Key {
  std::string part, ns, key;
  uint8_t type;
  bool operator<(const Key &o) const { return std::tie(part, ns, key, type) < std::tie(o.part, o.ns, o.key, o.type); }
};
struct Handle {
  std::string part, ns;
  bool readonly;
};

std::map<Key, std::vector<uint8_t>> g_items;
std::set<std::string> g_parts = {NVS_DEFAULT_PART_NAME};
std::map<std::pair<std::string, std::string>, bool> g_namespaces;  // (partición, namespace)
std::map<nvs_handle_t, Handle> g_handles;
nvs_handle_t g_next = 1;
std::string g_dir;
bool g_dirty = false;

size_t entries_of(uint8_t type, size_t len) {
  if (type == NVS_TYPE_STR || type == NVS_TYPE_BLOB) return 1 + (len + 31) / 32;
  return 1;
}

size_t used_entries(const std::string &part) {
  size_t n = 0;
  for (auto &[ns, _] : g_namespaces)
    if (ns.first == part) ++n;
  for (auto &[k, v] : g_items)
    if (k.part == part) n += entries_of(k.type, v.size());
  return n;
}

bool valid_name(const char *s) { return s && *s && std::strlen(s) < NVS_KEY_NAME_MAX_SIZE; }

const Handle *handle_of(nvs_handle_t h) {
  auto it = g_handles.find(h);
  return it == g_handles.end() ? nullptr : &it->second;
}

esp_err_t set_item(nvs_handle_t h, const char *key, uint8_t type, const void *data, size_t len) {
  const Handle *hd = handle_of(h);
  if (!hd) return ESP_ERR_NVS_INVALID_HANDLE;
  if (hd->readonly) return ESP_ERR_NVS_READ_ONLY;
  if (!key || !*key) return ESP_ERR_NVS_INVALID_NAME;
  if (std::strlen(key) >= NVS_KEY_NAME_MAX_SIZE) return ESP_ERR_NVS_KEY_TOO_LONG;
  if (type == NVS_TYPE_STR && len > kMaxStr) return ESP_ERR_NVS_VALUE_TOO_LONG;
  Key k{hd->part, hd->ns, key, type};
  const auto it = g_items.find(k);
  const size_t old = it == g_items.end() ? 0 : entries_of(type, it->second.size());
  // Se reserva una página para la recolección de basura, como ESP-IDF.
  if (used_entries(hd->part) - old + entries_of(type, len) > (kPages - 1) * kEntriesPerPage) return ESP_ERR_NVS_NOT_ENOUGH_SPACE;
  std::vector<uint8_t> v(static_cast<const uint8_t *>(data), static_cast<const uint8_t *>(data) + len);
  if (it != g_items.end() && it->second == v) return ESP_OK;
  g_items[k] = std::move(v);
  g_namespaces[{hd->part, hd->ns}] = true;
  g_dirty = true;
  jwsim_cpu(jwsim_costs()->hal_call);
  return ESP_OK;
}

const std::vector<uint8_t> *find_item(nvs_handle_t h, const char *key, uint8_t type, esp_err_t *err) {
  const Handle *hd = handle_of(h);
  if (!hd) {
    *err = ESP_ERR_NVS_INVALID_HANDLE;
    return nullptr;
  }
  if (!key || std::strlen(key) >= NVS_KEY_NAME_MAX_SIZE) {
    *err = key ? ESP_ERR_NVS_KEY_TOO_LONG : ESP_ERR_NVS_INVALID_NAME;
    return nullptr;
  }
  auto it = g_items.find(Key{hd->part, hd->ns, key, type});
  if (it == g_items.end()) {
    *err = ESP_ERR_NVS_NOT_FOUND;
    return nullptr;
  }
  *err = ESP_OK;
  return &it->second;
}

template <typename T>
esp_err_t get_num(nvs_handle_t h, const char *key, uint8_t type, T *out) {
  esp_err_t err;
  const auto *v = find_item(h, key, type, &err);
  if (!v) return err;
  if (out) std::memcpy(out, v->data(), sizeof(T));
  return ESP_OK;
}

esp_err_t get_var(nvs_handle_t h, const char *key, uint8_t type, void *out, size_t *len) {
  if (!len) return ESP_ERR_NVS_INVALID_LENGTH;
  esp_err_t err;
  const auto *v = find_item(h, key, type, &err);
  if (!v) return err;
  if (!out) {
    *len = v->size();
    return ESP_OK;
  }
  if (*len < v->size()) {
    *len = v->size();
    return ESP_ERR_NVS_INVALID_LENGTH;
  }
  std::memcpy(out, v->data(), v->size());
  *len = v->size();
  return ESP_OK;
}

void put_str(std::vector<uint8_t> &d, const std::string &s) {
  d.push_back(static_cast<uint8_t>(s.size()));
  d.insert(d.end(), s.begin(), s.end());
}

} // namespace

extern "C" {

esp_err_t nvs_flash_init(void) { return ESP_OK; }
esp_err_t nvs_flash_init_partition(const char *label) {
  if (!label || std::strlen(label) >= NVS_PART_NAME_MAX_SIZE) return ESP_ERR_NVS_PART_NOT_FOUND;
  g_parts.insert(label);
  return ESP_OK;
}
esp_err_t nvs_flash_deinit(void) { return ESP_OK; }
esp_err_t nvs_flash_deinit_partition(const char *) { return ESP_OK; }
esp_err_t nvs_flash_erase(void) { return nvs_flash_erase_partition(NVS_DEFAULT_PART_NAME); }
esp_err_t nvs_flash_erase_partition(const char *part) {
  const std::string p = part ? part : NVS_DEFAULT_PART_NAME;
  for (auto it = g_items.begin(); it != g_items.end();) it = it->first.part == p ? g_items.erase(it) : std::next(it);
  for (auto it = g_namespaces.begin(); it != g_namespaces.end();) it = it->first.first == p ? g_namespaces.erase(it) : std::next(it);
  g_dirty = true;
  return ESP_OK;
}

esp_err_t nvs_open_from_partition(const char *part, const char *ns, nvs_open_mode_t mode, nvs_handle_t *out) {
  const std::string p = part ? part : NVS_DEFAULT_PART_NAME;
  if (!g_parts.count(p)) return ESP_ERR_NVS_NOT_INITIALIZED;
  if (!valid_name(ns)) return ESP_ERR_NVS_INVALID_NAME;
  if (!out) return ESP_ERR_INVALID_ARG;
  if (!g_namespaces.count({p, ns})) {
    if (mode == NVS_READONLY) return ESP_ERR_NVS_NOT_FOUND;
    g_namespaces[{p, ns}] = true;
    g_dirty = true;
  }
  *out = g_next++;
  g_handles[*out] = Handle{p, ns, mode == NVS_READONLY};
  jwsim_cpu(jwsim_costs()->hal_call);
  return ESP_OK;
}
esp_err_t nvs_open(const char *ns, nvs_open_mode_t mode, nvs_handle_t *out) {
  return nvs_open_from_partition(NVS_DEFAULT_PART_NAME, ns, mode, out);
}
void nvs_close(nvs_handle_t h) { g_handles.erase(h); }
esp_err_t nvs_commit(nvs_handle_t h) { return handle_of(h) ? ESP_OK : ESP_ERR_NVS_INVALID_HANDLE; }

esp_err_t nvs_erase_key(nvs_handle_t h, const char *key) {
  const Handle *hd = handle_of(h);
  if (!hd) return ESP_ERR_NVS_INVALID_HANDLE;
  if (hd->readonly) return ESP_ERR_NVS_READ_ONLY;
  bool any = false;
  for (auto it = g_items.begin(); it != g_items.end();) {
    if (it->first.part == hd->part && it->first.ns == hd->ns && it->first.key == key) {
      it = g_items.erase(it);
      any = true;
    } else {
      ++it;
    }
  }
  if (!any) return ESP_ERR_NVS_NOT_FOUND;
  g_dirty = true;
  return ESP_OK;
}
esp_err_t nvs_erase_all(nvs_handle_t h) {
  const Handle *hd = handle_of(h);
  if (!hd) return ESP_ERR_NVS_INVALID_HANDLE;
  if (hd->readonly) return ESP_ERR_NVS_READ_ONLY;
  for (auto it = g_items.begin(); it != g_items.end();)
    it = (it->first.part == hd->part && it->first.ns == hd->ns) ? g_items.erase(it) : std::next(it);
  g_dirty = true;
  return ESP_OK;
}

#define JWSIM_NVS_NUM(name, T, type)                                                                  \
  esp_err_t nvs_set_##name(nvs_handle_t h, const char *key, T v) { return set_item(h, key, type, &v, sizeof(T)); } \
  esp_err_t nvs_get_##name(nvs_handle_t h, const char *key, T *out) { return get_num(h, key, type, out); }
JWSIM_NVS_NUM(i8, int8_t, NVS_TYPE_I8)
JWSIM_NVS_NUM(u8, uint8_t, NVS_TYPE_U8)
JWSIM_NVS_NUM(i16, int16_t, NVS_TYPE_I16)
JWSIM_NVS_NUM(u16, uint16_t, NVS_TYPE_U16)
JWSIM_NVS_NUM(i32, int32_t, NVS_TYPE_I32)
JWSIM_NVS_NUM(u32, uint32_t, NVS_TYPE_U32)
JWSIM_NVS_NUM(i64, int64_t, NVS_TYPE_I64)
JWSIM_NVS_NUM(u64, uint64_t, NVS_TYPE_U64)
#undef JWSIM_NVS_NUM

esp_err_t nvs_set_str(nvs_handle_t h, const char *key, const char *value) {
  if (!value) return ESP_ERR_INVALID_ARG;
  return set_item(h, key, NVS_TYPE_STR, value, std::strlen(value) + 1);
}
esp_err_t nvs_set_blob(nvs_handle_t h, const char *key, const void *value, size_t length) {
  if (!value && length) return ESP_ERR_INVALID_ARG;
  return set_item(h, key, NVS_TYPE_BLOB, value, length);
}
esp_err_t nvs_get_str(nvs_handle_t h, const char *key, char *out, size_t *len) { return get_var(h, key, NVS_TYPE_STR, out, len); }
esp_err_t nvs_get_blob(nvs_handle_t h, const char *key, void *out, size_t *len) { return get_var(h, key, NVS_TYPE_BLOB, out, len); }

esp_err_t nvs_find_key(nvs_handle_t h, const char *key, nvs_type_t *out_type) {
  const Handle *hd = handle_of(h);
  if (!hd) return ESP_ERR_NVS_INVALID_HANDLE;
  for (auto &[k, v] : g_items) {
    if (k.part == hd->part && k.ns == hd->ns && k.key == key) {
      if (out_type) *out_type = static_cast<nvs_type_t>(k.type);
      return ESP_OK;
    }
  }
  return ESP_ERR_NVS_NOT_FOUND;
}

esp_err_t nvs_get_stats(const char *part, nvs_stats_t *st) {
  if (!st) return ESP_ERR_INVALID_ARG;
  const std::string p = part ? part : NVS_DEFAULT_PART_NAME;
  if (!g_parts.count(p)) return ESP_ERR_NVS_PART_NOT_FOUND;
  st->total_entries = kPages * kEntriesPerPage;
  st->used_entries = used_entries(p);
  st->free_entries = st->total_entries - st->used_entries;
  st->available_entries = st->free_entries > kEntriesPerPage ? st->free_entries - kEntriesPerPage : 0;
  st->namespace_count = 0;
  for (auto &[ns, _] : g_namespaces)
    if (ns.first == p) ++st->namespace_count;
  return ESP_OK;
}

esp_err_t nvs_get_used_entry_count(nvs_handle_t h, size_t *used) {
  const Handle *hd = handle_of(h);
  if (!hd || !used) return ESP_ERR_NVS_INVALID_HANDLE;
  *used = 0;
  for (auto &[k, v] : g_items)
    if (k.part == hd->part && k.ns == hd->ns) *used += entries_of(k.type, v.size());
  return ESP_OK;
}

// ------------------------------------------------------------ persistencia
// nvs.bin: "JWNV", versión 1, namespaces y entradas con su partición.
void jwsim_nvs_set_storage(const char *dir) {
  g_dir = dir ? dir : "";
  std::vector<uint8_t> d;
  if (!jwsim::models::read_file(jwsim::models::join_path(g_dir, "nvs.bin"), d) || d.size() < 5 || std::memcmp(d.data(), "JWNV", 4) != 0) return;
  size_t i = 5;
  auto str = [&](std::string &s) {
    if (i >= d.size() || i + 1 + d[i] > d.size()) return false;
    s.assign(reinterpret_cast<const char *>(&d[i + 1]), d[i]);
    i += 1 + d[i];
    return true;
  };
  while (i < d.size()) {
    const uint8_t kind = d[i++];
    std::string part, ns, key;
    if (!str(part) || !str(ns)) break;
    g_parts.insert(part);
    g_namespaces[{part, ns}] = true;
    if (kind == 'N') continue;
    if (!str(key) || i + 5 > d.size()) break;
    const uint8_t type = d[i];
    uint32_t len;
    std::memcpy(&len, &d[i + 1], 4);
    i += 5;
    if (i + len > d.size()) break;
    g_items[Key{part, ns, key, type}] = std::vector<uint8_t>(d.begin() + static_cast<long>(i), d.begin() + static_cast<long>(i + len));
    i += len;
  }
  g_dirty = false;
}

int jwsim_nvs_save(void) {
  if (g_dir.empty() || !g_dirty) return 1;
  std::vector<uint8_t> d = {'J', 'W', 'N', 'V', 1};
  for (auto &[ns, _] : g_namespaces) {
    d.push_back('N');
    put_str(d, ns.first);
    put_str(d, ns.second);
  }
  for (auto &[k, v] : g_items) {
    d.push_back('E');
    put_str(d, k.part);
    put_str(d, k.ns);
    put_str(d, k.key);
    d.push_back(k.type);
    const uint32_t len = static_cast<uint32_t>(v.size());
    const auto *p = reinterpret_cast<const uint8_t *>(&len);
    d.insert(d.end(), p, p + 4);
    d.insert(d.end(), v.begin(), v.end());
  }
  if (!jwsim::models::write_file_atomic(jwsim::models::join_path(g_dir, "nvs.bin"), d.data(), d.size())) return 0;
  g_dirty = false;
  return 1;
}

} // extern "C"
