// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modo interactivo del runner (--port stdio): protocolo motor ↔ interfaz de
// docs/ARCHITECTURE.md §7 sobre stdin/stdout.
//
// Tramas [u32 LE longitud][u8 tipo][payload]; longitud = 1 + payload. Tipo 1
// = JSON UTF-8. Mensajes del MVP de G2:
//   UI → runner : {"type":"run","speed":1|10|0}  (0 = lo más rápido posible)
//                 {"type":"pause"} · {"type":"set","signal":"I0_3","value":1}
//                 {"type":"force","signal":"Q0_1","value":1} · {"type":"unforce","signal":"Q0_1"}
//                 {"type":"subscribe","buses":1|0[,"lossless":1]} · {"type":"quit"}
//                 {"type":"debug","attached":1|0} (gdb adjunto: sin vigilante)
//                 {"type":"hash"} → {"type":"hash","t_ns","trace_hash","trace_events"}
//                 "run" con "until_ns": corre hasta ese instante, pausa y
//                 responde {"type":"reached",...} con el hash (reproducción)
//   runner → UI : hello · signals · serial · bus · status · stopped (con hash)
//                 input: cada entrada aplicada con su t_ns, en formato .stim,
//                 para grabar la sesión y reproducirla con el mismo hash.
// El firmware avanza en tramos de 1 ms virtual sincronizados con el reloj de
// pared según la velocidad; los comandos se aplican entre tramos como eventos
// en el instante virtual actual, así una sesión interactiva queda en la traza
// igual que un archivo .stim.
#include "port.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#define JWSIM_READ _read
#define JWSIM_WRITE _write
#define JWSIM_DUP _dup
#define JWSIM_DUP2 _dup2
#include <process.h>
#define JWSIM_GETPID _getpid
#else
#include <unistd.h>
#if defined(__linux__)
#include <sys/prctl.h>
#endif
#define JWSIM_READ read
#define JWSIM_WRITE write
#define JWSIM_DUP dup
#define JWSIM_DUP2 dup2
#define JWSIM_GETPID getpid
#endif

#include "jwsim/engine.h"
#include "restart.h"
#include "stimulus.h"

namespace jwsim::runner {
namespace {

using Clock = std::chrono::steady_clock;
using Fields = std::map<std::string, std::string>;

constexpr uint8_t kFrameJson = 1;
constexpr int kProtocolVersion = 1;
constexpr auto kFlushPeriod = std::chrono::milliseconds(20);
constexpr uint8_t kFrameDisplay = 2;
constexpr size_t kBusMaxItems = 400;  // por envío; el resto se cuenta como descartado
constexpr size_t kBusMaxUartBytes = 256;
constexpr size_t kBusMaxSpiBytes = 64;
// Silencio que separa dos fragmentos de UART (tramas Modbus RTU incluidas:
// con la UART instantánea de G3, los bytes de una trama llegan juntos).
constexpr jwsim_ns_t kUartGapNs = 500 * JWSIM_NS_PER_US;

std::string hex(const uint8_t *data, size_t len) {
  static const char *digits = "0123456789abcdef";
  std::string out;
  out.reserve(len * 3);
  for (size_t i = 0; i < len; ++i) {
    if (i) out.push_back(' ');
    out.push_back(digits[data[i] >> 4]);
    out.push_back(digits[data[i] & 15]);
  }
  return out;
}

// ---------------------------------------------------------------- JSON
// Lector de objetos JSON planos (cadenas, números, booleanos y null), que es
// todo lo que envía la interfaz. Devuelve false ante un formato inesperado.
bool parse_flat_object(const std::string &s, Fields &out) {
  size_t i = 0;
  auto ws = [&] {
    while (i < s.size() && std::strchr(" \t\r\n", s[i])) ++i;
  };
  auto str = [&](std::string &v) {
    if (s[i] != '"') return false;
    for (++i; i < s.size() && s[i] != '"'; ++i) {
      if (s[i] == '\\' && i + 1 < s.size()) {
        const char e = s[++i];
        v.push_back(e == 'n' ? '\n' : e == 't' ? '\t' : e == 'r' ? '\r' : e);
      } else {
        v.push_back(s[i]);
      }
    }
    if (i >= s.size()) return false;
    ++i;
    return true;
  };
  ws();
  if (i >= s.size() || s[i++] != '{') return false;
  for (;;) {
    ws();
    if (i < s.size() && s[i] == '}') return true;
    std::string key, val;
    if (i >= s.size() || !str(key)) return false;
    ws();
    if (i >= s.size() || s[i++] != ':') return false;
    ws();
    if (i < s.size() && s[i] == '"') {
      if (!str(val)) return false;
    } else {
      while (i < s.size() && !std::strchr(",}", s[i]) && !std::strchr(" \t\r\n", s[i])) val.push_back(s[i++]);
    }
    out[key] = val;
    ws();
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
    if (i < s.size() && s[i] == '}') return true;
    return false;
  }
}

void json_escape(std::string &out, const char *data, size_t len) {
  for (size_t i = 0; i < len; ++i) {
    const unsigned char c = static_cast<unsigned char>(data[i]);
    if (c == '"' || c == '\\') {
      out.push_back('\\');
      out.push_back(static_cast<char>(c));
    } else if (c == '\n') {
      out += "\\n";
    } else if (c == '\r') {
      out += "\\r";
    } else if (c == '\t') {
      out += "\\t";
    } else if (c < 0x20 || c == 0x7f) {
      char buf[8];
      std::snprintf(buf, sizeof(buf), "\\u%04x", c);
      out += buf;
    } else {
      out.push_back(static_cast<char>(c));  // UTF-8 tal cual
    }
  }
}

std::string quoted(const std::string &s) {
  std::string out = "\"";
  json_escape(out, s.data(), s.size());
  out.push_back('"');
  return out;
}

// Largo del prefijo de `buf` que termina en un límite de carácter UTF-8: un
// carácter partido entre dos envíos se guarda para el siguiente.
size_t utf8_complete_prefix(const std::string &buf) {
  size_t n = buf.size();
  for (size_t back = 1; back <= 3 && back <= n; ++back) {
    const unsigned char c = static_cast<unsigned char>(buf[n - back]);
    if ((c & 0xC0) == 0x80) continue;  // byte de continuación
    const size_t need = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1;
    return need > back ? n - back : n;
  }
  return n;
}

// ---------------------------------------------------------------- E/S
int g_out_fd = -1;

void send_frame(uint8_t type, const std::string &payload) {
  std::string frame(5, '\0');
  const uint32_t len = static_cast<uint32_t>(payload.size() + 1);
  for (int b = 0; b < 4; ++b) frame[b] = static_cast<char>((len >> (8 * b)) & 0xff);
  frame[4] = static_cast<char>(type);
  frame += payload;
  size_t off = 0;
  while (off < frame.size()) {
    const auto w = JWSIM_WRITE(g_out_fd, frame.data() + off, static_cast<unsigned>(frame.size() - off));
    if (w <= 0) std::_Exit(0);  // la interfaz cerró el pipe
    off += static_cast<size_t>(w);
  }
}

void send_json(const std::string &json) { send_frame(kFrameJson, json); }

// Zona cambiada de la pantalla: [u16 x][u16 y][u16 w][u16 h][w·h píxeles
// RGB565 little-endian], todo little-endian (trama tipo 2).
void send_display(jwsim::models::ST7789 &tft) {
  int x, y, w, h;
  if (!tft.take_dirty(x, y, w, h)) return;
  std::string p;
  p.reserve(8 + static_cast<size_t>(w) * h * 2);
  auto u16 = [&p](int v) {
    p.push_back(static_cast<char>(v & 0xff));
    p.push_back(static_cast<char>((v >> 8) & 0xff));
  };
  u16(x);
  u16(y);
  u16(w);
  u16(h);
  for (int yy = y; yy < y + h; ++yy) {
    for (int xx = x; xx < x + w; ++xx) u16(tft.view_pixel(xx, yy));
  }
  send_frame(kFrameDisplay, p);
}

struct Inbox {
  std::mutex mu;
  std::condition_variable cv;
  std::deque<Fields> queue;
  bool closed = false;
};

bool read_exact(void *dst, size_t len) {
  auto *p = static_cast<char *>(dst);
  while (len > 0) {
    const auto r = JWSIM_READ(0, p, static_cast<unsigned>(len));
    if (r <= 0) return false;
    p += r;
    len -= static_cast<size_t>(r);
  }
  return true;
}

void reader_thread(Inbox *inbox) {
  for (;;) {
    uint8_t head[5];
    if (!read_exact(head, sizeof(head))) break;
    const uint32_t len = head[0] | (head[1] << 8) | (head[2] << 16) | (static_cast<uint32_t>(head[3]) << 24);
    if (len == 0 || len > (1u << 20)) break;
    std::string body(len - 1, '\0');
    if (len > 1 && !read_exact(body.data(), body.size())) break;
    Fields f;
    if (head[4] != kFrameJson || !parse_flat_object(body, f)) {
      std::fprintf(stderr, "[jwsim] trama inválida de la interfaz; se ignora\n");
      continue;
    }
    std::lock_guard<std::mutex> lk(inbox->mu);
    inbox->queue.push_back(std::move(f));
    inbox->cv.notify_one();
  }
  std::lock_guard<std::mutex> lk(inbox->mu);
  inbox->closed = true;
  inbox->cv.notify_one();
}

// ---------------------------------------------------------------- estado
} // namespace

int run_port(jwsim::boards::JwplcBasic &board, const std::function<RestartInfo()> &restart) {
#if defined(__linux__) && defined(PR_SET_PTRACER)
  // Depuración (G3): la interfaz adjunta gdb a este proceso, que no es hijo
  // de gdb. Con Yama (ptrace_scope = 1, por defecto en Ubuntu) hace falta
  // autorizarlo explícitamente.
  if (std::getenv("JWSIM_DEBUG")) prctl(PR_SET_PTRACER, PR_SET_PTRACER_ANY, 0, 0, 0);
#endif
  // stdout queda reservado a las tramas: cualquier printf del firmware o del
  // HAL va a stderr, que la interfaz muestra como mensajes del sistema.
  g_out_fd = JWSIM_DUP(1);
  JWSIM_DUP2(2, 1);
#if defined(_WIN32)
  _setmode(g_out_fd, _O_BINARY);
  _setmode(0, _O_BINARY);
#endif
  board.set_echo(false);

  // Cambios de bornera y bytes de UART acumulados hasta el próximo envío.
  std::map<std::string, bool> changed;
  std::string serial[3];
  const auto names = board.signal_names();
  for (const auto &name : names) {
    board.signal(name)->on_change([&changed, name](jwsim::Net &, bool level) { changed[name] = level; });
  }
  // Monitor de buses (pestaña Buses): solo mientras la interfaz lo pide.
  bool bus_on = false;
  std::string bus_items;
  size_t bus_count = 0;
  size_t bus_dropped = 0;
  std::string uart_bus[3];
  jwsim_ns_t uart_t0[3] = {0, 0, 0};
  jwsim_ns_t uart_last[3] = {0, 0, 0};
  // Sin pérdidas (captura de referencia): al llenarse el envío se manda ya.
  bool bus_lossless = false;
  auto send_bus = [&]() {
    if (!bus_count && !bus_dropped) return;
    send_json("{\"type\":\"bus\",\"t_ns\":" + std::to_string(jwsim_now()) + ",\"dropped\":" + std::to_string(bus_dropped) +
              ",\"items\":[" + bus_items + "]}");
    bus_items.clear();
    bus_count = 0;
    bus_dropped = 0;
  };
  auto bus_item = [&](const std::string &item) {
    if (bus_count >= kBusMaxItems) {
      if (!bus_lossless) {
        ++bus_dropped;
        return;
      }
      send_bus();
    }
    if (bus_count++) bus_items.push_back(',');
    bus_items += item;
  };
  // Fragmento de UART: [t, "UARTn TX", -1, hex, "", 0, bytes].
  auto uart_item = [&](int p) {
    if (uart_bus[p].empty()) return;
    const size_t n = std::min(uart_bus[p].size(), kBusMaxUartBytes);
    bus_item("[" + std::to_string(uart_t0[p]) + ",\"UART" + std::to_string(p) + " TX\",-1,\"" +
             hex(reinterpret_cast<const uint8_t *>(uart_bus[p].data()), n) + "\",\"\",0," +
             std::to_string(uart_bus[p].size()) + "]");
    uart_bus[p].clear();
  };
  board.set_uart_sink([&](int port, const uint8_t *data, size_t len) {
    serial[port].append(reinterpret_cast<const char *>(data), len);
    if (!bus_on) return;
    const jwsim_ns_t now = jwsim_now();
    if (!uart_bus[port].empty() && now - uart_last[port] > kUartGapNs) uart_item(port);
    if (uart_bus[port].empty()) uart_t0[port] = now;
    uart_bus[port].append(reinterpret_cast<const char *>(data), len);
    uart_last[port] = now;
  });
  // SPI por CS: [t, "VSPI", chip, mosi, miso, [[i,dc]...], bytes].
  if (jwsim::SPIBus *spi = board.spi_bus(3)) {
    spi->observe([&](const jwsim::SPIBus &bus, const jwsim::SPITransaction &tr) {
      const size_t n = std::min(tr.mosi.size(), kBusMaxSpiBytes);
      std::string dc = "[";
      for (size_t i = 0; i < tr.dc.size() && tr.dc[i].first < n; ++i) {
        dc += (i ? ",[" : "[") + std::to_string(tr.dc[i].first) + "," + (tr.dc[i].second ? "1" : "0") + "]";
      }
      dc += "]";
      bus_item("[" + std::to_string(tr.t_start) + "," + quoted(bus.name()) + "," + quoted(tr.chip) + ",\"" +
               hex(tr.mosi.data(), n) + "\",\"" + hex(tr.miso.data(), n) + "\"," + dc + "," +
               std::to_string(tr.total) + "]");
    });
  }
  if (jwsim::I2CBus *i2c = board.i2c_bus(0)) {
    i2c->observe([&](const jwsim::I2CBus &bus, uint8_t addr, const uint8_t *w, size_t wl, const uint8_t *r, size_t rl,
                     jwsim::I2CResult res) {
      if (!bus_on) return;
      bus_item("[" + std::to_string(jwsim_now()) + "," + quoted(bus.name()) + "," + std::to_string(addr) + ",\"" + hex(w, wl) +
               "\",\"" + hex(r, rl) + "\"," + std::to_string(static_cast<int>(res)) + "]");
    });
  }

  {
    std::string hello = "{\"type\":\"hello\",\"protocol\":" + std::to_string(kProtocolVersion) +
                        ",\"board\":" + quoted(board.name()) + ",\"t_ns\":" + std::to_string(jwsim_now()) +
                        ",\"pid\":" + std::to_string(JWSIM_GETPID()) + ",\"signals\":[";
    bool first = true;
    for (const auto &name : names) {
      hello += (first ? "[" : ",[") + quoted(name) + "," + (board.signal(name)->level() ? "1" : "0") + "]";
      first = false;
    }
    hello += "]}";
    send_json(hello);
  }

  Inbox inbox;
  std::thread(reader_thread, &inbox).detach();
  std::deque<InputEvent> inputs;  // direcciones estables para los eventos

  bool running = false;
  jwsim_ns_t until = 0;  // 0 = sin límite
  double speed = 1.0;  // 0 = sin sincronizar con el reloj de pared
  jwsim_ns_t base_t = jwsim_now();
  Clock::time_point base_wall = Clock::now();
  Clock::time_point last_flush = Clock::now();
  Clock::time_point last_save = Clock::now();
  bool quit = false;

  auto flush = [&](bool force) {
    const auto now = Clock::now();
    if (!force && now - last_flush < kFlushPeriod) return;
    last_flush = now;
    const std::string t = std::to_string(jwsim_now());
    if (!changed.empty()) {
      std::string m = "{\"type\":\"signals\",\"t_ns\":" + t + ",\"changes\":[";
      bool first = true;
      for (const auto &[name, level] : changed) {
        m += (first ? "[" : ",[") + quoted(name) + "," + (level ? "1" : "0") + "]";
        first = false;
      }
      m += "]}";
      send_json(m);
      changed.clear();
    } else {
      send_json("{\"type\":\"status\",\"t_ns\":" + t + ",\"state\":\"" + (running ? "running" : "paused") + "\"}");
    }
    // Fragmentos de UART cerrados (sin bytes nuevos desde hace un silencio).
    for (int p = 0; p < 3 && bus_on; ++p) {
      if (force || jwsim_now() - uart_last[p] > kUartGapNs) uart_item(p);
    }
    if (bus_on) {
      if (jwsim::SPIBus *spi = board.spi_bus(3)) spi->flush_capture();
    }
    send_bus();
    for (int p = 0; p < 3; ++p) {
      const size_t n = utf8_complete_prefix(serial[p]);
      if (n == 0) continue;
      std::string m = "{\"type\":\"serial\",\"port\":" + std::to_string(p) + ",\"t_ns\":" + t + ",\"text\":\"";
      json_escape(m, serial[p].data(), n);
      m += "\"}";
      send_json(m);
      serial[p].erase(0, n);
    }
    send_display(board.tft());
  };

  auto hash_json = [&](const char *type) {
    char hash[24];
    std::snprintf(hash, sizeof(hash), "0x%016llx", static_cast<unsigned long long>(jwsim_trace_hash()));
    return std::string("{\"type\":\"") + type + "\",\"t_ns\":" + std::to_string(jwsim_now()) + ",\"trace_hash\":\"" +
           hash + "\",\"trace_events\":" + std::to_string(jwsim_trace_count());
  };

  auto handle = [&](const Fields &f) {
    const auto type = f.count("type") ? f.at("type") : std::string();
    if (type == "run") {
      if (f.count("speed")) speed = std::max(0.0, std::atof(f.at("speed").c_str()));
      if (f.count("until_ns")) until = static_cast<jwsim_ns_t>(std::strtoull(f.at("until_ns").c_str(), nullptr, 10));
      running = true;
      base_t = jwsim_now();
      base_wall = Clock::now();
    } else if (type == "pause") {
      running = false;
      flush(true);
    } else if (type == "set" || type == "force" || type == "unforce") {
      InputEvent ev;
      ev.op = type == "set" ? InputOp::Set : type == "force" ? InputOp::Force : InputOp::Unforce;
      ev.signal = f.count("signal") ? f.at("signal") : std::string();
      const auto v = f.count("value") ? f.at("value") : std::string("0");
      ev.level = v == "1" || v == "true";
      ev.when = jwsim_now();
      const std::string err = validate_input(board, ev);
      if (!err.empty()) {
        std::fprintf(stderr, "[jwsim] %s: %s\n", type.c_str(), err.c_str());
        return;
      }
      inputs.push_back(ev);
      // En pausa el evento queda pendiente y se aplica al continuar, en el
      // mismo instante virtual (el firmware no corre mientras tanto).
      schedule_input(board, &inputs.back());
      send_json("{\"type\":\"input\",\"t_ns\":" + std::to_string(ev.when) + ",\"stim\":" + quoted(format_input(ev)) + "}");
    } else if (type == "uart") {
      // Bytes recibidos por una UART (consola desde la interfaz), en hex.
      InputEvent ev;
      ev.op = InputOp::Uart;
      ev.port = f.count("port") ? std::atoi(f.at("port").c_str()) : 0;
      const std::string h = f.count("hex") ? f.at("hex") : std::string();
      auto nib = [](char c) { return c <= '9' ? c - '0' : (c | 0x20) - 'a' + 10; };
      for (size_t i = 0; i + 1 < h.size() && std::isxdigit(static_cast<unsigned char>(h[i])) &&
                         std::isxdigit(static_cast<unsigned char>(h[i + 1]));
           i += 2)
        ev.data.push_back(static_cast<char>(nib(h[i]) << 4 | nib(h[i + 1])));
      ev.when = jwsim_now();
      const std::string err = validate_input(board, ev);
      if (!err.empty() || ev.data.empty()) {
        std::fprintf(stderr, "[jwsim] uart: %s\n", err.empty() ? "sin datos" : err.c_str());
        return;
      }
      inputs.push_back(ev);
      schedule_input(board, &inputs.back());
      send_json("{\"type\":\"input\",\"t_ns\":" + std::to_string(ev.when) + ",\"stim\":" + quoted(format_input(ev)) + "}");
    } else if (type == "subscribe") {
      bus_on = f.count("buses") && (f.at("buses") == "1" || f.at("buses") == "true");
      bus_lossless = f.count("lossless") && (f.at("lossless") == "1" || f.at("lossless") == "true");
      if (jwsim::SPIBus *spi = board.spi_bus(3)) spi->set_capture(bus_on);
      if (!bus_on) {
        bus_items.clear();
        bus_count = bus_dropped = 0;
        for (auto &u : uart_bus) u.clear();
      }
    } else if (type == "hash") {
      flush(true);
      send_json(hash_json("hash") + "}");
    } else if (type == "debug") {
      // La interfaz adjuntó (1) o soltó (0) el depurador.
      jwsim_watchdog_hold(f.count("attached") && f.at("attached") == "1");
    } else if (type == "quit") {
      quit = true;
    }
  };

  while (!quit) {
    {
      std::unique_lock<std::mutex> lk(inbox.mu);
      if (!running) inbox.cv.wait_for(lk, kFlushPeriod, [&] { return !inbox.queue.empty() || inbox.closed; });
      if (inbox.closed && inbox.queue.empty()) break;
      std::deque<Fields> batch;
      batch.swap(inbox.queue);
      lk.unlock();
      for (const auto &f : batch) handle(f);
    }
    if (quit) break;
    if (!running) {
      flush(false);
      continue;
    }
    // Tramo de 1 ms virtual (10 ms a máxima velocidad para reducir el
    // costo por tramo; los comandos se atienden igual cada ≤ 10 ms virtuales).
    const jwsim_ns_t step = speed > 0.0 ? JWSIM_NS_PER_MS : 10 * JWSIM_NS_PER_MS;
    jwsim_run_limits lim{jwsim_now() + step};
    if (until && lim.until_ns > until) lim.until_ns = until;
    jwsim_run(&lim);
    if (jwsim_restart_pending()) {
      // Lo que la interfaz envíe desde ahora llega con el ESP32 en reinicio:
      // queda sin leer y se descarta al terminar el proceso (no se graba).
      flush(true);
      const RestartInfo info = restart();
      send_json(hash_json("restart") + ",\"boot_ns\":" + std::to_string(jwsim_boot_ns()) + ",\"resume\":" +
                quoted(info.resume) + ",\"state\":" + quoted(info.state_dir) + ",\"state_temp\":" +
                (info.state_temp ? "true" : "false") + "}");
      return kRestartExitCode;
    }
    if (until && jwsim_now() >= until) {
      until = 0;
      running = false;
      flush(true);
      send_json(hash_json("reached") + "}");
      continue;
    }
    if (speed > 0.0) {
      const auto target = base_wall + std::chrono::nanoseconds(static_cast<int64_t>((jwsim_now() - base_t) / speed));
      // Si el host no da abasto, no se acumula atraso infinito.
      if (Clock::now() - target > std::chrono::milliseconds(250)) {
        base_t = jwsim_now();
        base_wall = Clock::now();
      } else {
        std::this_thread::sleep_until(target);
      }
    }
    flush(false);
    // Memoria no volátil al disco cada segundo de pared (y al salir): un
    // cierre abrupto de la app pierde a lo sumo ese lapso.
    if (Clock::now() - last_save > std::chrono::seconds(1)) {
      board.save_state();
      last_save = Clock::now();
    }
  }
  flush(true);
  send_json(hash_json("stopped") + ",\"reason\":\"quit\"}");
  return 0;
}

} // namespace jwsim::runner
