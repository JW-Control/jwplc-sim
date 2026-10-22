// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "stimulus.h"

#include <sstream>

namespace jwsim::runner {
namespace {

jwsim::boards::JwplcBasic *g_board = nullptr;

void apply(void *arg, jwsim_ns_t) {
  auto *ev = static_cast<InputEvent *>(arg);
  jwsim::Net *net = g_board->signal(ev->signal);
  switch (ev->op) {
    case InputOp::Set: net->drive(ev->level); break;
    case InputOp::Force: net->force(ev->level); break;
    case InputOp::Unforce: net->unforce(); break;
  }
  // Los forzados quedan en la traza aunque no cambien el nivel.
  if (ev->op != InputOp::Set) {
    const uint8_t rec[3] = {'F', static_cast<uint8_t>(ev->op), static_cast<uint8_t>(ev->level)};
    jwsim_trace_bytes(ev->signal.data(), ev->signal.size());
    jwsim_trace_bytes(rec, sizeof(rec));
    jwsim_trace_u64(jwsim_now());
  }
}

} // namespace

std::string parse_input(const std::string &text, InputEvent &out) {
  std::istringstream ss(text);
  std::string first, second;
  ss >> first;
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
  if (!board.signal(ev.signal)) return "señal desconocida: " + ev.signal;
  // Entradas: bornes I0_k y botones del frente (BTN_LEFT, BTN_OK...).
  const bool input = ev.signal.rfind("I0_", 0) == 0 || ev.signal.rfind("BTN_", 0) == 0;
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
  }
  return "";
}

} // namespace jwsim::runner
