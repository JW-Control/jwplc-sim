// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Runner headless del firmware simulado (modo G0/G5: consola + traza).
//
//   <exe> [--until <ms>] [--set NAME=V@<ms>]... [--stim <archivo>] [--quiet]
//         [--realtime <factor>] [--pause <t_ms>:<pared_ms>] [--seed <n>] [--stats]
//         [--state <dir>]   (memoria no volátil: FRAM, NVS, SD; se crea si falta)
//         [--screen <archivo>] (imagen final de la pantalla: "JWFB", u16 ancho,
//                               u16 alto y píxeles RGB565 little-endian)
//         [--screen-at <ms>:<archivo>]... (la pantalla en ese instante virtual)
//         [--rtc host|fijo:AAAA-MM-DDTHH:MM:SS] (hora del RTC al arrancar; sin
//                               esta opción sigue la del estado o, sin estado,
//                               un RTC sin hora válida)
//   <exe> --port stdio   (modo interactivo para la interfaz; ver port.cpp)
//
// Estímulos: "NAME=V@T" o, en archivo, líneas "<T> NAME=V" (T en ms; '#'
// inicia comentario). NAME es una señal de bornera (I0_0..I0_7).
// Al terminar imprime una línea JWSIM_RESULT con el hash de la traza: dos
// corridas con las mismas entradas deben producir el mismo hash.
#include <algorithm>
#include <chrono>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "board.h"
#include "jwsim/engine.h"
#include "port.h"
#include "stimulus.h"

extern "C" void app_main(void);
extern "C" void jwsim_seed_random(uint64_t seed);

namespace {

// timegm portátil (UTC, sin zona horaria del host).
std::time_t jwsim_timegm(const std::tm *tm) {
  int y = tm->tm_year + 1900, m = tm->tm_mon + 1;
  y -= m <= 2;
  const long era = (y >= 0 ? y : y - 399) / 400;
  const long yoe = y - era * 400;
  const long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + tm->tm_mday - 1;
  const long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const long long days = era * 146097LL + doe - 719468;
  return static_cast<std::time_t>(days * 86400 + tm->tm_hour * 3600 + tm->tm_min * 60 + tm->tm_sec);
}

void write_screen(jwsim::models::ST7789 &tft, const std::string &file) {
  std::string out = "JWFB";
  auto u16 = [&out](int v) {
    out.push_back(static_cast<char>(v & 0xff));
    out.push_back(static_cast<char>((v >> 8) & 0xff));
  };
  u16(tft.view_width());
  u16(tft.view_height());
  for (int y = 0; y < tft.view_height(); ++y)
    for (int x = 0; x < tft.view_width(); ++x) u16(tft.view_pixel(x, y));
  std::ofstream(file, std::ios::binary).write(out.data(), static_cast<std::streamsize>(out.size()));
}

struct ScreenShot {
  jwsim_ns_t when;
  std::string file;
};


[[noreturn]] void usage(const char *msg) {
  std::fprintf(stderr, "error: %s\n", msg);
  std::fprintf(stderr,
               "uso: <exe> [--until ms] [--set NAME=V@ms]... [--stim archivo] [--quiet] [--realtime factor] [--seed n]\n");
  std::exit(2);
}

jwsim_ns_t parse_ms(const std::string &s) {
  std::string t = s;
  if (t.size() > 2 && t.compare(t.size() - 2, 2, "ms") == 0) t.resize(t.size() - 2);
  char *end = nullptr;
  const double ms = std::strtod(t.c_str(), &end);
  if (!end || *end || ms < 0) usage(("tiempo inválido: " + s).c_str());
  return static_cast<jwsim_ns_t>(ms * 1e6 + 0.5);
}

void load_stim_file(const char *path, std::vector<jwsim::runner::InputEvent> &out) {
  std::ifstream in(path);
  if (!in) usage((std::string("no se puede abrir ") + path).c_str());
  std::string line;
  while (std::getline(in, line)) {
    const auto hash = line.find('#');
    if (hash != std::string::npos) line.resize(hash);
    std::istringstream ss(line);
    std::string t;
    if (!(ss >> t)) continue;
    std::string rest;
    std::getline(ss, rest);
    jwsim::runner::InputEvent ev;
    const std::string err = jwsim::runner::parse_input(rest, ev);
    if (!err.empty()) usage((err + " (línea: " + line + ")").c_str());
    ev.when = parse_ms(t);
    out.push_back(ev);
  }
}

} // namespace

int main(int argc, char **argv) {
  jwsim_ns_t until = 1000 * JWSIM_NS_PER_MS;
  double realtime = 0.0;
  jwsim_ns_t pause_at = JWSIM_NS_FOREVER;
  double pause_wall_ms = 0.0;
  bool quiet = false;
  bool stats = false;
  bool port = false;
  std::string state_dir;
  std::string screen_file;
  std::string rtc_mode;
  std::vector<ScreenShot> shots;
  std::vector<jwsim::runner::InputEvent> stims;

  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    auto next = [&]() -> std::string {
      if (i + 1 >= argc) usage(("falta valor para " + a).c_str());
      return argv[++i];
    };
    if (a == "--until") until = parse_ms(next());
    else if (a == "--quiet") quiet = true;
    else if (a == "--stats") stats = true;
    else if (a == "--port") {
      if (next() != "stdio") usage("--port solo admite 'stdio'");
      port = true;
    }
    else if (a == "--realtime") realtime = std::atof(next().c_str());
    else if (a == "--pause") {
      // --pause <t_ms>:<pared_ms>: detiene la simulación en t (tiempo virtual
      // congelado) durante pared_ms de reloj real y luego continúa.
      const std::string v = next();
      const auto colon = v.find(':');
      if (colon == std::string::npos) usage("--pause requiere <t_ms>:<pared_ms>");
      pause_at = parse_ms(v.substr(0, colon));
      pause_wall_ms = std::atof(v.substr(colon + 1).c_str());
    }
    else if (a == "--seed") jwsim_seed_random(std::strtoull(next().c_str(), nullptr, 0));
    else if (a == "--stim") load_stim_file(next().c_str(), stims);
    else if (a == "--state") state_dir = next();
    else if (a == "--screen") screen_file = next();
    else if (a == "--rtc") rtc_mode = next();
    else if (a == "--screen-at") {
      const std::string v = next();
      const auto colon = v.find(':');
      if (colon == std::string::npos) usage("--screen-at requiere <ms>:<archivo>");
      shots.push_back({parse_ms(v.substr(0, colon)), v.substr(colon + 1)});
    }
    else if (a == "--set") {
      const std::string v = next();
      const auto at = v.find('@');
      jwsim::runner::InputEvent ev;
      const std::string err = jwsim::runner::parse_input(v.substr(0, at), ev);
      if (!err.empty()) usage(err.c_str());
      ev.when = at == std::string::npos ? 0 : parse_ms(v.substr(at + 1));
      stims.push_back(ev);
    } else usage(("opción desconocida: " + a).c_str());
  }

  static jwsim::boards::JwplcBasic board;
  board.set_echo(!quiet);
  if (!state_dir.empty()) {
    std::error_code ec;
    std::filesystem::create_directories(state_dir, ec);
    board.set_state_dir(state_dir);
  }
  if (!rtc_mode.empty()) {
    if (rtc_mode == "host") {
      // Como sincronizar el RTC con la PC al encender (no reproducible). El
      // RTC guarda la hora de pared local, sin zona horaria.
      const std::time_t now = std::time(nullptr);
      std::tm local{};
#if defined(_WIN32)
      localtime_s(&local, &now);
#else
      localtime_r(&now, &local);
#endif
      board.rtc().set_time(static_cast<int64_t>(jwsim_timegm(&local)));
    } else if (rtc_mode.rfind("fijo:", 0) == 0) {
      int y, mo, d, h = 0, mi = 0, se = 0;
      if (std::sscanf(rtc_mode.c_str() + 5, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &se) < 3 || y < 2000 || y > 2199)
        usage("--rtc fijo:AAAA-MM-DDTHH:MM:SS (años 2000 a 2199)");
      std::tm tm{};
      tm.tm_year = y - 1900;
      tm.tm_mon = mo - 1;
      tm.tm_mday = d;
      tm.tm_hour = h;
      tm.tm_min = mi;
      tm.tm_sec = se;
      board.rtc().set_time(static_cast<int64_t>(jwsim_timegm(&tm)));
    } else {
      usage("--rtc admite 'host' o 'fijo:AAAA-MM-DDTHH:MM:SS'");
    }
  }
  // Capturas en instantes dados: eventos externos (no cambian la traza).
  for (auto &shot : shots) {
    jwsim_schedule_external_event(shot.when, [](void *arg, jwsim_ns_t) {
      auto *s = static_cast<ScreenShot *>(arg);
      write_screen(static_cast<jwsim::boards::JwplcBasic &>(jwsim::board()).tft(), s->file);
    }, &shot);
  }
  for (auto &s : stims) {
    const std::string err = jwsim::runner::validate_input(board, s);
    if (!err.empty()) usage(err.c_str());
    jwsim::runner::schedule_input(board, &s);
  }

  // Arranque idéntico al firmware real: app_main() del core del package crea
  // loopTask, loop1Task y jwplcSystemTask; el planificador las ejecuta.
  app_main();
  if (port) {
    const int rc = jwsim::runner::run_port(board);
    board.save_state();
    std::fflush(stdout);
    std::_Exit(rc);
  }

  const auto wall_start = std::chrono::steady_clock::now();
  jwsim_stop_reason reason = JWSIM_STOP_TIME;
  double max_lag_ms = 0.0;
  // Ejecuta [desde, hasta). Con --realtime avanza en tramos de 1 ms
  // sincronizados con el reloj de pared; `base` es el instante de pared que
  // corresponde a t = 0 (se corre tras una pausa).
  auto run_segment = [&](jwsim_ns_t from, jwsim_ns_t to, std::chrono::steady_clock::time_point base) {
    if (realtime <= 0.0) {
      jwsim_run_limits lim{to};
      reason = jwsim_run(&lim);
      return;
    }
    jwsim_ns_t t = from;
    do {
      t = std::min<jwsim_ns_t>(to, t + JWSIM_NS_PER_MS);
      jwsim_run_limits lim{t};
      reason = jwsim_run(&lim);
      const auto target = base + std::chrono::nanoseconds(static_cast<int64_t>(t / realtime));
      const double lag = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - target).count();
      max_lag_ms = std::max(max_lag_ms, lag);
      std::this_thread::sleep_until(target);
    } while (t < to && reason == JWSIM_STOP_TIME);
  };
  if (pause_at < until) {
    run_segment(0, pause_at, wall_start);
    const auto pause_ns = std::chrono::nanoseconds(static_cast<int64_t>(pause_wall_ms * 1e6));
    std::this_thread::sleep_for(pause_ns);   // pausa: no se llama jwsim_run()
    run_segment(pause_at, until, wall_start + pause_ns);
  } else {
    run_segment(0, until, wall_start);
  }
  const double wall_ms =
      std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - wall_start).count();
  board.flush_console();
  board.save_state();
  if (!screen_file.empty()) write_screen(board.tft(), screen_file);

  if (stats) {
    std::printf("--- estadísticas (tiempo virtual) ---\n");
    jwsim_print_task_stats(stdout);
    jwsim::I2CBus *i2c = board.i2c_bus(0);
    jwsim::SPIBus *spi = board.spi_bus(3);
    std::printf("I2C0: %llu transacciones, %llu NACK, %.3f ms de bus\n",
                static_cast<unsigned long long>(i2c->transactions), static_cast<unsigned long long>(i2c->nacks),
                static_cast<double>(i2c->busy_ns) / 1e6);
    std::printf("VSPI: %llu bytes (%llu sin dispositivo seleccionado)\n", static_cast<unsigned long long>(spi->bytes),
                static_cast<unsigned long long>(spi->unselected_bytes));
  }
  auto bits = [](uint8_t v) {
    std::string s = "0b";
    for (int k = 7; k >= 0; --k) s.push_back((v >> k) & 1 ? '1' : '0');
    return s;
  };
  std::printf("JWSIM_RESULT t_end_ms=%.3f stop=%s DI=%s DO=%s trace_events=%" PRIu64 " trace_hash=0x%016" PRIx64
              " wall_ms=%.1f rt_max_lag_ms=%.3f\n",
              static_cast<double>(jwsim_now()) / 1e6,
              reason == JWSIM_STOP_TIME ? "time" : reason == JWSIM_STOP_IDLE ? "idle" : "request",
              bits(board.inputs()).c_str(), bits(board.outputs()).c_str(), jwsim_trace_count(), jwsim_trace_hash(),
              wall_ms, realtime > 0.0 ? max_lag_ms : 0.0);
  std::fflush(stdout);
  // Las tareas del firmware nunca terminan: se sale sin destruir sus pilas.
  std::_Exit(0);
}
