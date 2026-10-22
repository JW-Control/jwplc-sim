// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "restart.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <vector>

#if defined(_WIN32)
#include <process.h>
#include <windows.h>
#else
#include <unistd.h>
#endif

#include "jwsim/models/persist.h"

namespace jwsim::runner {
namespace {

constexpr uint32_t kVersion = 1;

[[noreturn]] void fail(const std::string &msg) {
  std::fprintf(stderr, "[jwsim] reinicio: %s\n", msg.c_str());
  std::fflush(stderr);
  std::_Exit(2);
}

#if defined(_WIN32)
// Comillas según las reglas del CRT de Windows (CommandLineToArgvW).
std::string quote_arg(const std::string &a) {
  if (!a.empty() && a.find_first_of(" \t\"") == std::string::npos) return a;
  std::string out = "\"";
  size_t backslashes = 0;
  for (char c : a) {
    if (c == '\\') {
      ++backslashes;
      continue;
    }
    if (c == '"') out.append(backslashes * 2 + 1, '\\');
    else out.append(backslashes, '\\');
    backslashes = 0;
    out.push_back(c);
  }
  out.append(backslashes * 2, '\\');
  out.push_back('"');
  return out;
}
#endif

} // namespace

Resume read_resume(const std::string &path) {
  std::vector<uint8_t> data;
  if (!models::read_file(path, data)) fail("no se puede leer " + path);
  std::error_code ec;
  std::filesystem::remove(path, ec);
  models::StateReader r(data.data(), data.size());
  char magic[4];
  r.bytes(magic, 4);
  if (!r.ok() || std::string(magic, 4) != "JWRS" || r.u32() != kVersion) fail("formato inválido en " + path);
  Resume out;
  out.boot = r.u64();
  out.trace_hash = r.u64();
  out.trace_count = r.u64();
  out.restarts = r.u32();
  const uint32_t n = r.u32();
  for (uint32_t i = 0; i < n && r.ok(); ++i) out.applied.push_back(r.u32());
  const uint32_t warm = r.u32();
  out.warm.resize(warm);
  r.bytes(out.warm.data(), warm);
  if (!r.ok()) fail("archivo truncado: " + path);
  return out;
}

std::string prepare_restart(jwsim::boards::JwplcBasic &board, std::string &state_dir, bool &temp, uint32_t restarts,
                            const std::vector<uint32_t> &applied) {
  // El nuevo arranque cae en el próximo tick (los ticks de FreeRTOS cuentan
  // desde el arranque). No se modela el tiempo del bootloader, igual que en
  // el arranque en frío.
  const jwsim_ns_t now = jwsim_restart_time();
  const jwsim_ns_t boot = (now + JWSIM_TICK_NS - 1) / JWSIM_TICK_NS * JWSIM_TICK_NS;
  const uint8_t mark = 'R';
  jwsim_trace_bytes(&mark, 1);
  jwsim_trace_u64(boot);

  if (state_dir.empty()) {
    std::error_code ec;
    const auto base = std::filesystem::temp_directory_path(ec);
    if (ec) fail("sin directorio temporal para el estado");
    for (int i = 0;; ++i) {
#if defined(_WIN32)
      const int pid = _getpid();
#else
      const int pid = getpid();
#endif
      const auto dir = base / ("jwsim-reinicio-" + std::to_string(pid) + "-" + std::to_string(i));
      if (std::filesystem::create_directory(dir, ec)) {
        state_dir = dir.string();
        break;
      }
      if (i > 100) fail("no se puede crear un directorio temporal para el estado");
    }
    temp = true;
    board.set_state_dir(state_dir);
  }
  board.flush_console();
  board.save_state();

  models::StateWriter warm;
  board.save_warm(warm);
  models::StateWriter w;
  w.bytes("JWRS", 4);
  w.u32(kVersion);
  w.u64(boot);
  w.u64(jwsim_trace_hash());
  w.u64(jwsim_trace_count());
  w.u32(restarts + 1);
  w.u32(static_cast<uint32_t>(applied.size()));
  for (uint32_t i : applied) w.u32(i);
  w.u32(static_cast<uint32_t>(warm.data().size()));
  w.bytes(warm.data().data(), warm.data().size());
  const std::string path = models::join_path(state_dir, kResumeFile);
  if (!models::write_file_atomic(path, w.data().data(), w.data().size())) fail("no se puede escribir " + path);
  return path;
}

void reexec(int argc, char **argv, const std::string &resume, const std::string &state_dir, bool temp) {
  std::vector<std::string> args;
  for (int i = 0; i < argc; ++i) {
    const std::string a = argv[i];
    // Las opciones de la reanudación anterior se reemplazan.
    if (a == "--resume" || (temp && a == "--state")) {
      ++i;
      continue;
    }
    if (a == "--state-temp") continue;
    args.push_back(a);
  }
  args.push_back("--resume");
  args.push_back(resume);
  if (temp) {
    args.push_back("--state");
    args.push_back(state_dir);
    args.push_back("--state-temp");
  }
  std::fflush(stdout);
  std::fflush(stderr);
#if defined(_WIN32)
  // Sin exec en Windows: el proceso nuevo hereda la consola y las tuberías,
  // y este espera y devuelve su código de salida.
  char exe[MAX_PATH];
  if (!GetModuleFileNameA(nullptr, exe, sizeof(exe))) fail("no se encuentra el ejecutable");
  std::vector<std::string> quoted;
  for (const auto &a : args) quoted.push_back(quote_arg(a));
  std::vector<const char *> cargv;
  for (const auto &a : quoted) cargv.push_back(a.c_str());
  cargv.push_back(nullptr);
  const intptr_t rc = _spawnv(_P_WAIT, exe, cargv.data());
  if (rc < 0) fail("no se pudo lanzar el proceso nuevo");
  std::_Exit(static_cast<int>(rc));
#else
  std::vector<char *> cargv;
  for (auto &a : args) cargv.push_back(a.data());
  cargv.push_back(nullptr);
  execv("/proc/self/exe", cargv.data());
  execv(argv[0], cargv.data());
  fail("no se pudo re-ejecutar el runner");
#endif
}

void remove_temp_state(const std::string &dir) {
  std::error_code ec;
  std::filesystem::remove_all(dir, ec);
}

} // namespace jwsim::runner
