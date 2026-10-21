// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modo interactivo del runner: protocolo motor ↔ interfaz por stdin/stdout.
#ifndef JWSIM_RUNNER_PORT_H
#define JWSIM_RUNNER_PORT_H

#include "board.h"

namespace jwsim::runner {

// Atiende la interfaz hasta recibir "quit" o hasta que se cierre stdin.
int run_port(jwsim::boards::JwplcBasic &board);

} // namespace jwsim::runner

#endif
