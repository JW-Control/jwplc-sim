// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Lectura y escritura de archivos de estado persistente de los modelos
// (FRAM, NVS, imagen de la SD...). La escritura es atómica: se escribe un
// temporal y se renombra, así un corte del proceso no deja un archivo a medias.
#ifndef JWSIM_MODELS_PERSIST_H
#define JWSIM_MODELS_PERSIST_H

#include <cstdint>
#include <string>
#include <vector>

namespace jwsim::models {

// Devuelve false si el archivo no existe o no se pudo leer.
bool read_file(const std::string &path, std::vector<uint8_t> &out);
bool write_file_atomic(const std::string &path, const uint8_t *data, size_t len);
std::string join_path(const std::string &dir, const std::string &name);

// Serialización binaria del estado "tibio" (lo que sobrevive a un reinicio del
// ESP32 sin cortar la alimentación): enteros little-endian y bloques.
class StateWriter {
 public:
  void u8(uint8_t v) { b_.push_back(v); }
  void u16(uint16_t v) { put(v, 2); }
  void u32(uint32_t v) { put(v, 4); }
  void u64(uint64_t v) { put(v, 8); }
  void bytes(const void *p, size_t n) {
    const auto *c = static_cast<const uint8_t *>(p);
    b_.insert(b_.end(), c, c + n);
  }
  void str(const std::string &s) {
    u32(static_cast<uint32_t>(s.size()));
    bytes(s.data(), s.size());
  }
  const std::vector<uint8_t> &data() const { return b_; }

 private:
  void put(uint64_t v, int n) {
    for (int i = 0; i < n; ++i) b_.push_back(static_cast<uint8_t>(v >> (8 * i)));
  }
  std::vector<uint8_t> b_;
};

class StateReader {
 public:
  StateReader(const uint8_t *p, size_t n) : p_(p), end_(p + n) {}
  bool ok() const { return ok_; }
  uint8_t u8() { return static_cast<uint8_t>(get(1)); }
  uint16_t u16() { return static_cast<uint16_t>(get(2)); }
  uint32_t u32() { return static_cast<uint32_t>(get(4)); }
  uint64_t u64() { return get(8); }
  void bytes(void *out, size_t n) {
    if (static_cast<size_t>(end_ - p_) < n) {
      ok_ = false;
      return;
    }
    for (size_t i = 0; i < n; ++i) static_cast<uint8_t *>(out)[i] = p_[i];
    p_ += n;
  }
  std::string str() {
    const uint32_t n = u32();
    if (!ok_ || static_cast<size_t>(end_ - p_) < n) {
      ok_ = false;
      return {};
    }
    std::string s(reinterpret_cast<const char *>(p_), n);
    p_ += n;
    return s;
  }

 private:
  uint64_t get(int n) {
    if (end_ - p_ < n) {
      ok_ = false;
      return 0;
    }
    uint64_t v = 0;
    for (int i = 0; i < n; ++i) v |= static_cast<uint64_t>(p_[i]) << (8 * i);
    p_ += n;
    return v;
  }
  const uint8_t *p_;
  const uint8_t *end_;
  bool ok_ = true;
};

} // namespace jwsim::models

#endif
