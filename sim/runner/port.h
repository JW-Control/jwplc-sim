// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modo interactivo del runner: protocolo motor ↔ interfaz por stdin/stdout.
#ifndef JWSIM_RUNNER_PORT_H
#define JWSIM_RUNNER_PORT_H

#include <functional>
#include <string>

#include "board.h"

namespace jwsim::runner {

struct RestartInfo {
  std::string resume;      // archivo de reanudación
  std::string state_dir;   // directorio de estado que debe recibir el proceso nuevo
  bool state_temp = false;
};

// Atiende la interfaz hasta recibir "quit", hasta que se cierre stdin o hasta
// un esp_restart() del firmware: entonces llama a `restart`, informa
// {"type":"restart"} y devuelve kRestartExitCode (la interfaz lanza el
// proceso nuevo con --resume).
int run_port(jwsim::boards::JwplcBasic &board, const std::function<RestartInfo()> &restart);

} // namespace jwsim::runner

#endif
