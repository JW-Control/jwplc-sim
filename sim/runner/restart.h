// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Reinicio del ESP32 simulado (esp_restart, gate JWSIM_G4_HAL_EXTRAS).
//
// El firmware no puede reiniciarse dentro del mismo proceso (sus variables
// globales y constructores estáticos ya corrieron), así que el runner arranca
// un proceso nuevo del mismo ejecutable:
//   1. el proceso viejo guarda la memoria no volátil (FRAM, NVS, RTC) en el
//      directorio de estado (uno temporal si no hay --state) y escribe
//      "reinicio.bin": instante del nuevo arranque, traza acumulada, eventos
//      del .stim ya aplicados y estado tibio de la placa (expansor, pantalla,
//      entradas y forzados de la interfaz);
//   2. en modo CLI se re-ejecuta con --resume; en modo --port informa
//      {"type":"restart"} y la interfaz lanza el proceso nuevo;
//   3. el proceso nuevo arranca el firmware en ese instante (millis() desde 0,
//      esp_reset_reason() = ESP_RST_SW) con la traza encadenada: corridas
//      repetidas dan el mismo hash final.
#ifndef JWSIM_RUNNER_RESTART_H
#define JWSIM_RUNNER_RESTART_H

#include <cstdint>
#include <string>
#include <vector>

#include "board.h"
#include "jwsim/engine.h"

namespace jwsim::runner {

constexpr int kRestartExitCode = 75;
constexpr const char *kResumeFile = "reinicio.bin";

struct Resume {
  jwsim_ns_t boot = 0;
  uint64_t trace_hash = 0;
  uint64_t trace_count = 0;
  uint32_t restarts = 0;            // reinicios acumulados en la sesión
  std::vector<uint32_t> applied;    // índices de eventos .stim ya aplicados
  std::vector<uint8_t> warm;        // estado tibio de la placa
};

// Lee y borra el archivo de reanudación. Termina con error si no es válido.
Resume read_resume(const std::string &path);

// Tras un jwsim_run() que volvió por un reinicio: guarda el estado y escribe
// el archivo de reanudación. Si `state_dir` está vacío crea uno temporal (y
// pone `temp` en true). Devuelve la ruta del archivo.
std::string prepare_restart(jwsim::boards::JwplcBasic &board, std::string &state_dir, bool &temp,
                            uint32_t restarts, const std::vector<uint32_t> &applied);

// Re-ejecuta el runner con los mismos argumentos más --resume (y --state si
// el directorio es temporal). No vuelve.
[[noreturn]] void reexec(int argc, char **argv, const std::string &resume, const std::string &state_dir, bool temp);

// Borra el directorio de estado temporal de la sesión.
void remove_temp_state(const std::string &dir);

} // namespace jwsim::runner

#endif
