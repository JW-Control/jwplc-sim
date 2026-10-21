// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Incluido con -include en las unidades C++ para Linux (glibc). newlib, la
// libc del toolchain xtensa del ESP32, declara strchr/strrchr/strstr/
// strpbrk/memchr solo con la firma C (devuelven char *). glibc agrega
// sobrecargas const en C++ y entonces código válido para el ESP32 deja de
// compilar (p. ej. FS/vfs_api.cpp:55). string.h decide si las declara con
// __GNUC_PREREQ/__glibc_clang_prereq: se neutralizan solo durante esa
// inclusión (el guard de string.h evita que vuelva a procesarse después).
#pragma once
#if defined(__cplusplus) && defined(__linux__)
#include <features.h>
#pragma push_macro("__GNUC_PREREQ")
#pragma push_macro("__glibc_clang_prereq")
#undef __GNUC_PREREQ
#undef __glibc_clang_prereq
#define __GNUC_PREREQ(maj, min) 0
#define __glibc_clang_prereq(maj, min) 0
#include <string.h>
#pragma pop_macro("__glibc_clang_prereq")
#pragma pop_macro("__GNUC_PREREQ")
#endif
