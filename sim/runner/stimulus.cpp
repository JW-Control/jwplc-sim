// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "stimulus.h"

#include <cctype>
#include <sstream>

#include "jwsim/devices.h"

namespace jwsim::runner {
namespace {

jwsim::boards::JwplcBasic *g_board = nullptr;

void apply(void *arg, jwsim_ns_t) {
  auto *ev = static_cast<InputEvent *>(arg);
  ev->applied = true;
  if (ev->op == InputOp::Uart) {
    const uint8_t rec[2] = {'U', static_cast<uint8_t>(ev->port)};
    jwsim_trace_bytes(rec, sizeof(rec));
    jwsim::uart_inject(ev->port, reinterpret_cast<const uint8_t *>(ev->data.data()), ev->data.size());
    return;
  }
  jwsim::Net *net = g_board->signal(ev->signal);
  switch (ev->op) {
    case InputOp::Set: net->drive(ev->level); break;
    case InputOp::Force: net->force(ev->level); break;
    case InputOp::Unforce: net->unforce(); break;
    case InputOp::Uart: break;
  }
  // Los forzados quedan en la traza aunque no cambien el nivel.
  if (ev->op != InputOp::Set) {
    const uint8_t rec[3] = {'F', static_cast<uint8_t>(ev->op), static_cast<uint8_t>(ev->level)};
    jwsim_trace_bytes(ev->signal.data(), ev->signal.size());
    jwsim_trace_bytes(rec, sizeof(rec));
    jwsim_trace_u64(jwsim_now());
  }
}

// 'uartN "texto"': N y el texto con escapes.
std::string parse_uart(const std::string &text, InputEvent &out) {
  size_t i = text.find_first_not_of(" \t");
  if (text.compare(i, 4, "uart") != 0 || i + 4 >= text.size() || !std::isdigit(static_cast<unsigned char>(text[i + 4])))
    return "uart inválida: " + text;
  out.op = InputOp::Uart;
  out.port = text[i + 4] - '0';
  out.data.clear();
  i = text.find_first_not_of(" \t", i + 5);
  if (i == std::string::npos || text[i] != '"') return "falta el texto entre comillas: " + text;
  for (++i; i < text.size() && text[i] != '"'; ++i) {
    char c = text[i];
    if (c == '\\') {
      if (++i >= text.size()) break;
      switch (text[i]) {
        case 'n': c = '\n'; break;
        case 'r': c = '\r'; break;
        case 't': c = '\t'; break;
        case 'x': {
          if (i + 2 >= text.size() || !std::isxdigit(static_cast<unsigned char>(text[i + 1])) ||
              !std::isxdigit(static_cast<unsigned char>(text[i + 2])))
            return "escape \\x inválido: " + text;
          c = static_cast<char>(std::stoi(text.substr(i + 1, 2), nullptr, 16));
          i += 2;
          break;
        }
        default: c = text[i];
      }
    }
    out.data.push_back(c);
  }
  if (i >= text.size()) return "falta la comilla de cierre: " + text;
  if (text.find_first_not_of(" \t", i + 1) != std::string::npos) return "texto sobrante después de las comillas: " + text;
  return "";
}

} // namespace

std::string parse_input(const std::string &text, InputEvent &out) {
  std::istringstream ss(text);
  std::string first, second;
  ss >> first;
  if (first.rfind("uart", 0) == 0) return parse_uart(text, out);
  if (first == "force" || first == "unforce") {
    out.op = first == "force" ? InputOp::Force : InputOp::Unforce;
    if (!(ss >> second)) return "falta la señal después de '" + first + "'";
  } else {
    out.op = InputOp::Set;
    second = first;
  }
  if (out.op == InputOp::Unforce) {
    out.signal = second;
    out.level = false;
    return "";
  }
  const auto eq = second.find('=');
  if (eq == std::string::npos) return "entrada inválida: " + text;
  out.signal = second.substr(0, eq);
  const std::string v = second.substr(eq + 1);
  if (v != "0" && v != "1") return "valor inválido (0/1): " + text;
  out.level = v == "1";
  return "";
}

std::string validate_input(jwsim::boards::JwplcBasic &board, const InputEvent &ev) {
  if (ev.op == InputOp::Uart) {
    if (ev.port != 0 && ev.port != 2) return "solo se recibe por la UART 0 (consola) y la 2 (RS-485): uart" + std::to_string(ev.port);
    return "";
  }
  if (!board.signal(ev.signal)) return "señal desconocida: " + ev.signal;
  // Entradas: bornes I0_k, botones del frente (BTN_LEFT, BTN_OK...) y la
  // tarjeta microSD (SD_CARD: 1 = insertada).
  const bool input = ev.signal.rfind("I0_", 0) == 0 || ev.signal.rfind("BTN_", 0) == 0 || ev.signal == "SD_CARD";
  const bool output = ev.signal.rfind("Q0_", 0) == 0;
  if (ev.op == InputOp::Set && !input) return "solo las entradas (I0_k, BTN_*) se asignan; las salidas se fuerzan: " + ev.signal;
  if (!input && !output) return "solo se fuerzan entradas (I0_k, BTN_*) y salidas Q0_k: " + ev.signal;
  return "";
}

void schedule_input(jwsim::boards::JwplcBasic &board, InputEvent *ev) {
  g_board = &board;
  jwsim_schedule_external_event(ev->when, apply, ev);
}

std::string format_input(const InputEvent &ev) {
  switch (ev.op) {
    case InputOp::Set: return ev.signal + "=" + (ev.level ? "1" : "0");
    case InputOp::Force: return "force " + ev.signal + "=" + (ev.level ? "1" : "0");
    case InputOp::Unforce: return "unforce " + ev.signal;
    case InputOp::Uart: {
      static const char *digits = "0123456789abcdef";
      std::string out = "uart" + std::to_string(ev.port) + " \"";
      for (unsigned char c : ev.data) {
        if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else if (c == '"' || c == '\\') (out += '\\') += static_cast<char>(c);
        else if (c < 0x20 || c >= 0x7f) (out += "\\x") += std::string{digits[c >> 4], digits[c & 15]};
        else out += static_cast<char>(c);
      }
      return out + "\"";
    }
  }
  return "";
}

std::string strip_comment(const std::string &line) {
  bool quote = false;
  for (size_t i = 0; i < line.size(); ++i) {
    if (quote && line[i] == '\\') ++i;
    else if (line[i] == '"') quote = !quote;
    else if (line[i] == '#' && !quote) return line.substr(0, i);
  }
  return line;
}

} // namespace jwsim::runner
