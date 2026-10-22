// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Hora del sistema del ESP32 simulado (time, gettimeofday, settimeofday,
// clock_gettime del firmware; ver sim/hal/fw-libc.syms).
//
// Como en ESP-IDF: al encender la hora es 0 (1970-01-01 00:00:00 UTC) y
// avanza con el tiempo virtual; settimeofday la fija; un esp_restart() no la
// pierde (el temporizador RTC del ESP32 sigue contando). Nunca se lee el
// reloj del host, así que los sellos de tiempo de la SD son reproducibles.
#include <cerrno>
#include <cstdint>
#include <ctime>

#include <sys/time.h>

#include "jwsim/engine.h"

namespace {
// Hora del sistema en µs = g_base_us + tiempo virtual absoluto en µs.
int64_t g_base_us = 0;

int64_t now_us() { return g_base_us + static_cast<int64_t>(jwsim_now() / JWSIM_NS_PER_US); }
} // namespace

extern "C" {

int64_t jwsim_systime_base(void) { return g_base_us; }
void jwsim_systime_set_base(int64_t base_us) { g_base_us = base_us; }

time_t jwsim_fw_time(time_t *t) {
  const time_t s = static_cast<time_t>(now_us() / 1000000);
  if (t) *t = s;
  return s;
}

int jwsim_fw_gettimeofday(struct timeval *tv, void *) {
  if (tv) {
    const int64_t us = now_us();
    tv->tv_sec = static_cast<decltype(tv->tv_sec)>(us / 1000000);
    tv->tv_usec = static_cast<decltype(tv->tv_usec)>(us % 1000000);
  }
  return 0;
}

int jwsim_fw_settimeofday(const struct timeval *tv, const void *) {
  if (tv) g_base_us = static_cast<int64_t>(tv->tv_sec) * 1000000 + tv->tv_usec - static_cast<int64_t>(jwsim_now() / JWSIM_NS_PER_US);
  return 0;
}

int jwsim_fw_clock_gettime(clockid_t id, struct timespec *ts) {
  if (!ts) {
    errno = EINVAL;
    return -1;
  }
  int64_t ns;
  if (id == CLOCK_REALTIME) ns = now_us() * 1000;
  else if (id == CLOCK_MONOTONIC) ns = static_cast<int64_t>(jwsim_now() - jwsim_boot_ns());
  else {
    errno = EINVAL;
    return -1;
  }
  ts->tv_sec = static_cast<time_t>(ns / 1000000000);
  ts->tv_nsec = static_cast<long>(ns % 1000000000);
  return 0;
}

// Nombres de MinGW (time() es inline sobre _time64).
time_t jwsim_fw__time64(time_t *t) { return jwsim_fw_time(t); }
int jwsim_fw_mingw_gettimeofday(struct timeval *tv, void *tz) { return jwsim_fw_gettimeofday(tv, tz); }
#if defined(_WIN32)
// _time64 se importa de la DLL del CRT: el código llama a través del puntero
// __imp__time64 (tabla de importación). Su reemplazo es un puntero igual.
time_t (*__imp_jwsim_fw__time64)(time_t *) = jwsim_fw__time64;
#endif

} // extern "C"
