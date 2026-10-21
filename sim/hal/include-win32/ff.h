// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// FatFs elige tipos de Windows (windows.h, DWORD = unsigned long) cuando
// _WIN32 está definido. En el ESP32 FatFs usa los tipos C99 (DWORD =
// uint32_t), que es lo que esperan diskio_impl.h y la librería SD. Se oculta
// _WIN32 solo durante la inclusión de ff.h; los headers del sistema que
// necesita se incluyen antes, con _WIN32 visible.
//
// Las unidades FatFs/SD/FS lo reciben vía jwsim_fatfs_win32.h con -include (ver
// sim/core-manifest.json), porque FatFs se incluye a sí mismo con comillas.
#pragma once
#include <float.h>
#include <stdint.h>
#include <sys/param.h>
#include <sys/types.h>
#pragma push_macro("_WIN32")
#undef _WIN32
#include_next <ff.h>
#pragma pop_macro("_WIN32")
