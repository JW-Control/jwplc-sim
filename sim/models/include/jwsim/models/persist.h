// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Lectura y escritura de archivos de estado persistente de los modelos
// (FRAM, NVS, imagen de la SD...). La escritura es atómica: se escribe un
// temporal y se renombra, así un corte del proceso no deja un archivo a medias.
#ifndef JWSIM_MODELS_PERSIST_H
#define JWSIM_MODELS_PERSIST_H

#include <cstdint>
#include <string>
#include <vector>

namespace jwsim::models {

// Devuelve false si el archivo no existe o no se pudo leer.
bool read_file(const std::string &path, std::vector<uint8_t> &out);
bool write_file_atomic(const std::string &path, const uint8_t *data, size_t len);
std::string join_path(const std::string &dir, const std::string &name);

} // namespace jwsim::models

#endif
