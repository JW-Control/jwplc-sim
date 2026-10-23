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
//         [--no-eth]       (sin el W5500; por defecto está poblado como en la
//                               placa. La red la dan las líneas "net" del .stim
//                               o, con --port, app/lib/net-bridge.mjs)
//   <exe> --port stdio   (modo interactivo para la interfaz; ver port.cpp)
//   --resume <archivo>   (interno: proceso nuevo tras esp_restart; ver restart.h)
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
#include "restart.h"
#include "stimulus.h"

extern "C" void app_main(void);
extern "C" void jwsim_seed_random(uint64_t seed);
extern "C" void jwsim_set_reset_reason(int reason);
extern "C" void jwsim_systime_set_base(int64_t base_us);

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
    line = jwsim::runner::strip_comment(line);
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
  std::string resume_file;
  bool state_temp = false;
  bool seeded = false;
  uint64_t seed = 0;
  bool eth = true;

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
    else if (a == "--seed") {
      seed = std::strtoull(next().c_str(), nullptr, 0);
      seeded = true;
    }
    else if (a == "--resume") resume_file = next();
    else if (a == "--state-temp") state_temp = true;
    else if (a == "--eth") eth = true;   // compatibilidad: ya es el valor por defecto
    else if (a == "--no-eth") eth = false;
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

  // Proceso nuevo tras esp_restart(): arranque en el instante guardado, con
  // la traza encadenada y lo externo al ESP32 como estaba.
  jwsim::runner::Resume resume;
  if (!resume_file.empty()) {
    resume = jwsim::runner::read_resume(resume_file);
    jwsim_set_boot(resume.boot, resume.trace_hash, resume.trace_count);
    jwsim_set_reset_reason(3);   // ESP_RST_SW
    jwsim_systime_set_base(resume.systime_base_us);   // el RTC del ESP32 sigue contando
    rtc_mode.clear();            // el RTC tiene batería: no se vuelve a fijar
  }
  // El generador de números aleatorios no repite la secuencia en cada
  // arranque (en el ESP32 es de hardware), pero sigue siendo reproducible.
  if (seeded || resume.restarts) jwsim_seed_random((seeded ? seed : 0x4A57504C4353494DULL) + 0x9E3779B97F4A7C15ULL * resume.restarts);

  static jwsim::boards::JwplcBasic board;
  board.set_echo(!quiet);
  // Red del W5500 fuera de la interfaz: lo que el chip envía no llega a
  // nadie; las respuestas vienen del .stim (líneas "net", p. ej. una sesión
  // grabada). run_port() la reemplaza por la de la interfaz.
  struct NoPeers : jwsim::models::W5500::Network {
    void tcp_listen(int, uint16_t) override {}
    void tcp_connect(int, uint16_t, uint32_t, uint16_t) override {}
    void tcp_send(int, const uint8_t *, size_t) override {}
    void tcp_close(int, bool) override {}
    void udp_open(int, uint16_t) override {}
    void udp_send(int, uint32_t, uint16_t, const uint8_t *, size_t) override {}
    void udp_close(int) override {}
  };
  static NoPeers no_peers;
  if (eth) {
    board.set_ethernet(true);
    board.eth().set_network(&no_peers);
  }
  if (!state_dir.empty()) {
    std::error_code ec;
    std::filesystem::create_directories(state_dir, ec);
    board.set_state_dir(state_dir);
  }
  // Ante una falla del firmware (abort, assert, vigilante) lo ya escrito en
  // FRAM, NVS y RTC queda guardado, como en la placa.
  static std::string temp_dir;
  if (state_temp) temp_dir = state_dir;
  jwsim_set_fatal_hook([] {
    board.flush_console();
    board.save_state();
    if (!temp_dir.empty()) jwsim::runner::remove_temp_state(temp_dir);
  });
  if (!resume_file.empty()) {
    jwsim::models::StateReader r(resume.warm.data(), resume.warm.size());
    if (!board.load_warm(r)) usage("estado tibio inválido en el archivo de reanudación");
    for (uint32_t i : resume.applied) {
      if (i < stims.size()) stims[i].applied = true;
    }
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
  // Zona horaria del firmware: la del ESP32 por defecto (UTC), no la de la
  // PC; un setenv("TZ", ...) + tzset() del sketch la cambia como en la placa.
#if defined(_WIN32)
  _putenv_s("TZ", "UTC0");
  _tzset();
#else
  setenv("TZ", "UTC0", 1);
  tzset();
#endif
  // Capturas en instantes dados: eventos externos (no cambian la traza).
  for (auto &shot : shots) {
    if (shot.when < jwsim_boot_ns()) continue;
    jwsim_schedule_external_event(shot.when, [](void *arg, jwsim_ns_t) {
      auto *s = static_cast<ScreenShot *>(arg);
      write_screen(static_cast<jwsim::boards::JwplcBasic &>(jwsim::board()).tft(), s->file);
    }, &shot);
  }
  for (auto &s : stims) {
    const std::string err = jwsim::runner::validate_input(board, s);
    if (!err.empty()) usage(err.c_str());
    // Lo ya aplicado antes del reinicio está en el estado tibio.
    if (!s.applied) jwsim::runner::schedule_input(board, &s);
  }
  // Prepara el reinicio pedido por el firmware y devuelve el archivo de
  // reanudación (el directorio de estado temporal pasa al proceso nuevo).
  auto restart = [&]() {
    std::vector<uint32_t> applied;
    for (uint32_t i = 0; i < stims.size(); ++i) {
      if (stims[i].applied) applied.push_back(i);
    }
    bool temp = state_temp;
    const std::string file = jwsim::runner::prepare_restart(board, state_dir, temp, resume.restarts, applied);
    return std::make_pair(file, temp);
  };

  // Arranque idéntico al firmware real: app_main() del core del package crea
  // loopTask, loop1Task y jwplcSystemTask; el planificador las ejecuta.
  app_main();
  if (port) {
    const int rc = jwsim::runner::run_port(board, [&]() {
      const auto [file, temp] = restart();
      return jwsim::runner::RestartInfo{file, state_dir, temp};
    });
    if (rc != jwsim::runner::kRestartExitCode) {
      board.save_state();
      if (state_temp) jwsim::runner::remove_temp_state(state_dir);
    }
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
  // Tras un reinicio el tiempo virtual sigue desde el arranque t0: el
  // instante de pared de t = 0 queda en el pasado.
  const jwsim_ns_t t0 = jwsim_boot_ns();
  const auto origin = wall_start - std::chrono::nanoseconds(realtime > 0.0 ? static_cast<int64_t>(t0 / realtime) : 0);
  auto restart_if_pending = [&]() {
    if (!jwsim_restart_pending()) return;
    const auto [file, temp] = restart();
    jwsim::runner::reexec(argc, argv, file, state_dir, temp);
  };
  if (pause_at < until && pause_at >= t0) {
    run_segment(t0, pause_at, origin);
    restart_if_pending();
    const auto pause_ns = std::chrono::nanoseconds(static_cast<int64_t>(pause_wall_ms * 1e6));
    std::this_thread::sleep_for(pause_ns);   // pausa: no se llama jwsim_run()
    run_segment(pause_at, until, origin + pause_ns);
  } else {
    run_segment(t0, until, origin);
  }
  restart_if_pending();
  const double wall_ms =
      std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - wall_start).count();
  board.flush_console();
  board.save_state();
  if (state_temp) jwsim::runner::remove_temp_state(state_dir);
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
