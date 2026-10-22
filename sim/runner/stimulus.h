// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Entradas externas del runner: asignación de una entrada de bornera y
// forzado/desforzado de entradas y salidas (G3). Las mismas para un archivo
// .stim, la línea de comandos y la interfaz (--port), de modo que una sesión
// interactiva grabada se reproduce desde archivo con el mismo hash.
//
// Formato .stim (T en ms; '#' inicia comentario):
//   T I0_0=1            asignar una entrada
//   T force Q0_3=1      forzar una entrada o salida
//   T unforce Q0_3      quitar el forzado
#ifndef JWSIM_RUNNER_STIMULUS_H
#define JWSIM_RUNNER_STIMULUS_H

#include <string>

#include "board.h"
#include "jwsim/engine.h"

namespace jwsim::runner {

enum class InputOp { Set, Force, Unforce };

struct InputEvent {
  jwsim_ns_t when = 0;
  InputOp op = InputOp::Set;
  std::string signal;
  bool level = false;
};

// Interpreta "I0_0=1", "force Q0_3=1" o "unforce Q0_3" (sin el tiempo).
// Devuelve un mensaje de error vacío si es válida para la placa.
std::string parse_input(const std::string &text, InputEvent &out);
std::string validate_input(jwsim::boards::JwplcBasic &board, const InputEvent &ev);

// Agenda la entrada como evento externo en ev.when. `ev` debe seguir vivo
// hasta que se aplique.
void schedule_input(jwsim::boards::JwplcBasic &board, InputEvent *ev);

// Texto .stim equivalente (sin el tiempo), para la grabación.
std::string format_input(const InputEvent &ev);

} // namespace jwsim::runner

#endif
