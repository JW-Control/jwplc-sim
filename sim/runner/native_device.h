// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Dispositivos nativos (SDK G7, sdk/native/jwsim_device.h): bibliotecas
// compartidas que el runner carga con --device y conecta a las señales de la
// placa en tiempo virtual.
#ifndef JWSIM_RUNNER_NATIVE_DEVICE_H
#define JWSIM_RUNNER_NATIVE_DEVICE_H

#include <string>
#include <vector>

#include "board.h"

namespace jwsim::runner {

struct NativeDeviceSpec {
  std::string path;
  std::string params = "{}";
};

// Carga y crea cada dispositivo. Devuelve un mensaje de error vacío si todos
// cargaron.
std::string load_native_devices(jwsim::boards::JwplcBasic &board, const std::vector<NativeDeviceSpec> &specs);

} // namespace jwsim::runner

#endif
