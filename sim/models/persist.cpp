// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "jwsim/models/persist.h"

#include <cstdio>
#if defined(_WIN32)
#include <windows.h>
#endif

namespace jwsim::models {

bool read_file(const std::string &path, std::vector<uint8_t> &out) {
  FILE *f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  out.clear();
  uint8_t buf[65536];
  size_t n;
  while ((n = std::fread(buf, 1, sizeof(buf), f)) > 0) out.insert(out.end(), buf, buf + n);
  const bool ok = !std::ferror(f);
  std::fclose(f);
  return ok;
}

bool write_file_atomic(const std::string &path, const uint8_t *data, size_t len) {
  const std::string tmp = path + ".tmp";
  FILE *f = std::fopen(tmp.c_str(), "wb");
  if (!f) return false;
  const bool ok = std::fwrite(data, 1, len, f) == len && std::fflush(f) == 0;
  std::fclose(f);
  if (!ok) return false;
#if defined(_WIN32)
  return MoveFileExA(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING) != 0;
#else
  return std::rename(tmp.c_str(), path.c_str()) == 0;
#endif
}

std::string join_path(const std::string &dir, const std::string &name) {
  if (dir.empty()) return name;
  const char last = dir.back();
  return (last == '/' || last == '\\') ? dir + name : dir + "/" + name;
}

} // namespace jwsim::models
