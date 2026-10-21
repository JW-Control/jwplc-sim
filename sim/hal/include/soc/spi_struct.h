// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo a nivel de registros del controlador SPI (GP-SPI) del ESP32, solo
// para los campos que el package accede directamente.
//
// La librería SPI del package (lecturas FIFO-reuse para el W5500) toma el
// primer miembro de spi_t como `volatile spi_dev_t *` y escribe
// mosi_dlen/miso_dlen/cmd.usr, espera `while (dev->cmd.usr)` y lee
// data_buf[]. Aquí cada registro es un proxy C++: escribir cmd.usr = 1
// ejecuta la transferencia en el bus simulado (con su duración en tiempo
// virtual) y la lectura posterior de cmd.usr devuelve 0.
//
// La disposición de memoria NO es la del hardware (solo importan los nombres
// de los campos). Cualquier campo nuevo que use el package debe agregarse aquí.
#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif
uint32_t jwsim_spi_reg_read(const volatile void *reg);
void jwsim_spi_reg_write(volatile void *reg, uint32_t value);
#ifdef __cplusplus
}

struct jwsim_spi_reg32 {
  uint32_t raw;
  operator uint32_t() const volatile { return jwsim_spi_reg_read(this); }
  volatile jwsim_spi_reg32 &operator=(uint32_t v) volatile {
    jwsim_spi_reg_write(this, v);
    return *this;
  }
};

typedef struct spi_dev_s {
  struct { jwsim_spi_reg32 usr; } cmd;
  struct { jwsim_spi_reg32 usr_mosi_dbitlen; } mosi_dlen;
  struct { jwsim_spi_reg32 usr_miso_dbitlen; } miso_dlen;
  jwsim_spi_reg32 data_buf[16];
} spi_dev_t;
#endif
