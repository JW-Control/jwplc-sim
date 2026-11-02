// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// pgmspace.h del core del package con una corrección para hosts de 64 bits.
//
// En el ESP32 (ILP32) `pgm_read_dword` lee un `unsigned long` de 32 bits y
// el código de terceros lo usa también para leer punteros guardados en
// PROGMEM: TFT_eSPI hace `(GFXglyph *)pgm_read_dword(&gfxFont->glyph)` en
// setFreeFont()/drawChar(). En el simulador los punteros miden 64 bits:
//   - Linux (LP64): `unsigned long` mide 64 bits y funcionaba por casualidad.
//   - Windows (LLP64): `unsigned long` mide 32 bits, el puntero se trunca y
//     el ejecutable (base 0x140000000) cae con 0xC0000005 al usar una
//     FreeFont (p. ej. 06.HMI_Botonera_Interactiva al cambiar de página).
// Aquí, en C++, si lo apuntado mide lo que un puntero se lee completo; si
// no, se leen 32 bits como en la placa. El resto del header es el original.
#pragma once
#include_next <pgmspace.h>

#if defined(__cplusplus)
#include <stdint.h>

template <typename T>
static inline auto jwsim_pgm_read_dword(const volatile T *addr)
{
  if constexpr (sizeof(void *) > 4 && sizeof(T) == sizeof(void *))
    return static_cast<uintptr_t>(*reinterpret_cast<const uintptr_t *>(const_cast<const T *>(addr)));
  else
    return static_cast<unsigned long>(*reinterpret_cast<const uint32_t *>(const_cast<const T *>(addr)));
}
static inline unsigned long jwsim_pgm_read_dword(const volatile void *addr)
{
  return *reinterpret_cast<const uint32_t *>(const_cast<const void *>(addr));
}

#undef pgm_read_dword
#define pgm_read_dword(addr) jwsim_pgm_read_dword(addr)
#endif
