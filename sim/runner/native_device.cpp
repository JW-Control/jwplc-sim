// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "native_device.h"

#include <cstdio>
#include <deque>
#include <memory>

#include "../../sdk/native/jwsim_device.h"
#include "jwsim/engine.h"
#include "stimulus.h"

#if defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace jwsim::runner {
namespace {

struct Device {
  jwsim_host host{};
  jwsim::boards::JwplcBasic *board = nullptr;
  const jwsim_device_desc *desc = nullptr;
  void *dev = nullptr;
  std::string tag;
  std::deque<InputEvent> inputs;  // direcciones estables hasta aplicarse
};

struct Timer {
  void (*fn)(void *, jwsim_device_ns);
  void *dev;
};

std::deque<std::unique_ptr<Device>> g_devices;

jwsim_device_ns host_now(void *) { return jwsim_now(); }

int host_get(void *ctx, const char *name) {
  auto *d = static_cast<Device *>(ctx);
  jwsim::Net *n = d->board->signal(name ? name : "");
  return n ? (n->level() ? 1 : 0) : -1;
}

int host_set(void *ctx, const char *name, int level) {
  auto *d = static_cast<Device *>(ctx);
  InputEvent ev;
  ev.op = InputOp::Set;
  ev.signal = name ? name : "";
  ev.level = level != 0;
  ev.when = jwsim_now();
  const std::string err = validate_input(*d->board, ev);
  if (!err.empty()) {
    std::fprintf(stderr, "[dispositivo %s] signal_set: %s\n", d->tag.c_str(), err.c_str());
    return -1;
  }
  d->inputs.push_back(ev);
  schedule_input(*d->board, &d->inputs.back());
  // Lo ya aplicado no se vuelve a usar: se descarta del frente.
  while (d->inputs.size() > 1 && d->inputs.front().applied) d->inputs.pop_front();
  return 0;
}

void host_schedule(void *, jwsim_device_ns at, void (*fn)(void *, jwsim_device_ns), void *dev) {
  auto *t = new Timer{fn, dev};
  const jwsim_ns_t when = at < jwsim_now() ? jwsim_now() : at;
  jwsim_schedule_external_event(when, [](void *arg, jwsim_ns_t now) {
    std::unique_ptr<Timer> timer(static_cast<Timer *>(arg));
    timer->fn(timer->dev, now);
  }, t);
}

void host_log(void *ctx, const char *msg) {
  std::fprintf(stderr, "[dispositivo %s] %s\n", static_cast<Device *>(ctx)->tag.c_str(), msg ? msg : "");
}

std::string load_library(const std::string &path, jwsim_device_entry_fn &entry) {
#if defined(_WIN32)
  HMODULE h = LoadLibraryA(path.c_str());
  if (!h) return "no se pudo cargar " + path + " (error " + std::to_string(GetLastError()) + ")";
  entry = reinterpret_cast<jwsim_device_entry_fn>(reinterpret_cast<void *>(GetProcAddress(h, JWSIM_DEVICE_ENTRY)));
#else
  void *h = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!h) return std::string("no se pudo cargar ") + path + ": " + dlerror();
  entry = reinterpret_cast<jwsim_device_entry_fn>(dlsym(h, JWSIM_DEVICE_ENTRY));
#endif
  if (!entry) return path + " no exporta " JWSIM_DEVICE_ENTRY "()";
  return {};
}

} // namespace

std::string load_native_devices(jwsim::boards::JwplcBasic &board, const std::vector<NativeDeviceSpec> &specs) {
  for (const auto &spec : specs) {
    jwsim_device_entry_fn entry = nullptr;
    std::string err = load_library(spec.path, entry);
    if (!err.empty()) return err;
    const jwsim_device_desc *desc = entry();
    if (!desc || desc->abi != JWSIM_DEVICE_ABI) {
      return spec.path + ": ABI " + std::to_string(desc ? desc->abi : 0) + ", el runner usa " + std::to_string(JWSIM_DEVICE_ABI);
    }
    if (!desc->create || !desc->type) return spec.path + ": descripción incompleta (type, create)";
    auto d = std::make_unique<Device>();
    d->board = &board;
    d->desc = desc;
    d->tag = std::string(desc->type) + "@" + (desc->version ? desc->version : "?");
    d->host = jwsim_host{JWSIM_DEVICE_ABI, d.get(), host_now, host_get, host_set, host_schedule, host_log};
    d->dev = desc->create(&d->host, spec.params.c_str());
    if (!d->dev) return spec.path + ": create() falló con los parámetros " + spec.params;
    const std::string watch = desc->watch ? std::string(desc->watch(d->dev) ? desc->watch(d->dev) : "") : "";
    Device *raw = d.get();
    for (size_t i = 0; i < watch.size();) {
      const size_t c = std::min(watch.find(',', i), watch.size());
      const std::string name = watch.substr(i, c - i);
      i = c + 1;
      if (name.empty()) continue;
      jwsim::Net *net = board.signal(name);
      if (!net) return d->tag + ": vigila la señal desconocida " + name;
      if (desc->on_signal) {
        net->on_change([raw, name](jwsim::Net &, bool level) {
          raw->desc->on_signal(raw->dev, name.c_str(), level ? 1 : 0, jwsim_now());
        });
      }
    }
    std::fprintf(stderr, "[jwsim] dispositivo nativo %s (%s)\n", d->tag.c_str(), desc->name ? desc->name : "");
    g_devices.push_back(std::move(d));
  }
  return {};
}

} // namespace jwsim::runner
