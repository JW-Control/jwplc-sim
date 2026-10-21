// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Atributos de ubicación en memoria de ESP-IDF. En el host no hay IRAM/RTC
// RAM: se aceptan y no tienen efecto (RTC_NOINIT/NOINIT no sobreviven a un
// reinicio simulado; ver ARCHITECTURE.md §10).
#pragma once
#define IRAM_ATTR
#define DRAM_ATTR
#define IRAM_DATA_ATTR
#define IRAM_BSS_ATTR
#define DRAM_STR(str) (str)
#define RTC_IRAM_ATTR
#define RTC_DATA_ATTR
#define RTC_RODATA_ATTR
#define RTC_SLOW_ATTR
#define RTC_FAST_ATTR
#define RTC_NOINIT_ATTR
#define NOINIT_ATTR
#define EXT_RAM_ATTR
#define EXT_RAM_BSS_ATTR
#define EXT_RAM_NOINIT_ATTR
#define COREDUMP_DRAM_ATTR
#define WORD_ALIGNED_ATTR __attribute__((aligned(4)))
#define FORCE_INLINE_ATTR static inline __attribute__((always_inline))
#define NOINLINE_ATTR __attribute__((noinline))
#define IRAM_ATTR_NOINLINE
#define ESP_ALWAYS_INLINE __attribute__((always_inline))
#define __NOINIT_ATTR
