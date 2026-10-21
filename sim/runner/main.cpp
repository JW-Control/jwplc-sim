// Runner headless del firmware simulado (modo G0/G5: consola + traza).
//
//   <exe> [--until <ms>] [--set NAME=V@<ms>]... [--stim <archivo>] [--quiet]
//         [--realtime <factor>] [--seed <n>] [--stats]
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
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "board.h"
#include "jwsim/engine.h"

extern "C" void app_main(void);
extern "C" void jwsim_seed_random(uint64_t seed);

namespace {

struct Stimulus {
  jwsim_ns_t when;
  std::string signal;
  bool level;
};

jwsim::boards::JwplcBasic *g_board = nullptr;

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

Stimulus parse_assignment(const std::string &assign, jwsim_ns_t when) {
  const auto eq = assign.find('=');
  if (eq == std::string::npos) usage(("estímulo inválido: " + assign).c_str());
  const std::string name = assign.substr(0, eq);
  const std::string value = assign.substr(eq + 1);
  if (value != "0" && value != "1") usage(("valor inválido (0/1): " + assign).c_str());
  return Stimulus{when, name, value == "1"};
}

void load_stim_file(const char *path, std::vector<Stimulus> &out) {
  std::ifstream in(path);
  if (!in) usage((std::string("no se puede abrir ") + path).c_str());
  std::string line;
  while (std::getline(in, line)) {
    const auto hash = line.find('#');
    if (hash != std::string::npos) line.resize(hash);
    std::istringstream ss(line);
    std::string t, assign;
    if (!(ss >> t)) continue;
    if (!(ss >> assign)) usage(("línea de estímulo incompleta: " + line).c_str());
    out.push_back(parse_assignment(assign, parse_ms(t)));
  }
}

void apply_stimulus(void *arg, jwsim_ns_t) {
  auto *s = static_cast<Stimulus *>(arg);
  jwsim::Net *net = g_board->signal(s->signal);
  net->drive(s->level);
}

} // namespace

int main(int argc, char **argv) {
  jwsim_ns_t until = 1000 * JWSIM_NS_PER_MS;
  double realtime = 0.0;
  bool quiet = false;
  bool stats = false;
  std::vector<Stimulus> stims;

  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    auto next = [&]() -> std::string {
      if (i + 1 >= argc) usage(("falta valor para " + a).c_str());
      return argv[++i];
    };
    if (a == "--until") until = parse_ms(next());
    else if (a == "--quiet") quiet = true;
    else if (a == "--stats") stats = true;
    else if (a == "--realtime") realtime = std::atof(next().c_str());
    else if (a == "--seed") jwsim_seed_random(std::strtoull(next().c_str(), nullptr, 0));
    else if (a == "--stim") load_stim_file(next().c_str(), stims);
    else if (a == "--set") {
      const std::string v = next();
      const auto at = v.find('@');
      stims.push_back(parse_assignment(v.substr(0, at), at == std::string::npos ? 0 : parse_ms(v.substr(at + 1))));
    } else usage(("opción desconocida: " + a).c_str());
  }

  static jwsim::boards::JwplcBasic board;
  g_board = &board;
  board.set_echo(!quiet);
  for (auto &s : stims) {
    jwsim::Net *net = board.signal(s.signal);
    if (!net || s.signal.rfind("I0_", 0) != 0) usage(("señal de entrada desconocida: " + s.signal).c_str());
    jwsim_schedule_event(s.when, apply_stimulus, &s);
  }

  // Arranque idéntico al firmware real: app_main() del core del package crea
  // loopTask, loop1Task y jwplcSystemTask; el planificador las ejecuta.
  app_main();

  const auto wall_start = std::chrono::steady_clock::now();
  jwsim_stop_reason reason;
  if (realtime > 0.0) {
    // Ejecución sincronizada con el reloj de pared (x factor), en tramos de 1 ms.
    jwsim_ns_t t = 0;
    do {
      t = std::min<jwsim_ns_t>(until, t + JWSIM_NS_PER_MS);
      jwsim_run_limits lim{t};
      reason = jwsim_run(&lim);
      const auto target = wall_start + std::chrono::nanoseconds(static_cast<int64_t>(t / realtime));
      std::this_thread::sleep_until(target);
    } while (t < until && reason == JWSIM_STOP_TIME);
  } else {
    jwsim_run_limits lim{until};
    reason = jwsim_run(&lim);
  }
  const double wall_ms =
      std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - wall_start).count();
  board.flush_console();

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
              " wall_ms=%.1f\n",
              static_cast<double>(jwsim_now()) / 1e6,
              reason == JWSIM_STOP_TIME ? "time" : reason == JWSIM_STOP_IDLE ? "idle" : "request",
              bits(board.inputs()).c_str(), bits(board.outputs()).c_str(), jwsim_trace_count(), jwsim_trace_hash(),
              wall_ms);
  std::fflush(stdout);
  // Las tareas del firmware nunca terminan: se sale sin destruir sus pilas.
  std::_Exit(0);
}
