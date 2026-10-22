// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo del controlador de pantalla ST7789 (Sitronix) por SPI de 4 hilos
// (D/C aparte). Ver sim/models/st7789/MODEL.md.
#ifndef JWSIM_MODELS_ST7789_H
#define JWSIM_MODELS_ST7789_H

#include <cstdint>
#include <vector>

#include "jwsim/devices.h"

namespace jwsim::models {

class ST7789 : public SPITarget {
 public:
  static constexpr int kGramW = 240, kGramH = 320;  // memoria de la ST7789
  enum Cmd : uint8_t {
    NOP = 0x00, SWRESET = 0x01, SLPIN = 0x10, SLPOUT = 0x11, NORON = 0x13, INVOFF = 0x20, INVON = 0x21,
    DISPOFF = 0x28, DISPON = 0x29, CASET = 0x2A, RASET = 0x2B, RAMWR = 0x2C, MADCTL = 0x36, COLMOD = 0x3A,
    RAMWRC = 0x3C,
  };
  static constexpr uint8_t MAD_MY = 0x80, MAD_MX = 0x40, MAD_MV = 0x20, MAD_BGR = 0x08;

  // Panel conectado: ventana visible de la memoria (columnas x0..x0+w-1,
  // filas y0..y0+h-1) y cómo está cableado (orden BGR, inversión propia).
  struct Panel {
    int x0 = 35, y0 = 0, w = 170, h = 320;
    bool bgr = true;       // los colores son correctos con MADCTL.BGR = 1
    bool inverted = true;  // los colores son correctos con INVON (IPS)
  };

  ST7789(Net &dc, Net *reset_n, Panel panel);

  // Imagen tal como se ve, en RGB565, girada a horizontal (h × w → w' = h,
  // h' = w; píxel (X, Y) = memoria[fila 319 - X][columna x0 + Y]). Negro con
  // la pantalla apagada o dormida.
  int view_width() const { return panel_.h; }
  int view_height() const { return panel_.w; }
  uint16_t view_pixel(int x, int y) const;

  // Zona cambiada desde la última llamada (coordenadas de la vista); false si
  // no hubo cambios.
  bool take_dirty(int &x, int &y, int &w, int &h);
  uint64_t frames() const { return pixels_written_; }

  uint16_t gram(int px, int py) const { return gram_[static_cast<size_t>(py) * kGramW + px]; }
  uint8_t madctl() const { return madctl_; }
  bool display_on() const { return display_on_ && !sleeping_; }
  bool inversion() const { return inversion_; }

  // SPITarget
  void spi_select(bool selected) override;
  uint8_t spi_transfer(uint8_t mosi) override;

 private:
  void reset();
  void command(uint8_t cmd);
  void param(uint8_t b);
  void pixel(uint16_t rgb565);
  void mark_all();
  void mark(int px, int py);

  Net &dc_;
  Panel panel_;
  std::vector<uint16_t> gram_;
  uint8_t cmd_ = NOP;
  int nparam_ = 0;
  uint8_t params_[4]{};
  uint8_t madctl_ = 0, colmod_ = 0x66;
  bool inversion_ = false, display_on_ = false, sleeping_ = true;
  int xs_ = 0, xe_ = kGramW - 1, ys_ = 0, ye_ = kGramH - 1;
  int ca_ = 0, ra_ = 0;
  bool have_hi_ = false;
  uint8_t hi_ = 0;
  // Zona sucia en coordenadas de la vista.
  int dx0_ = 1 << 30, dy0_ = 1 << 30, dx1_ = -1, dy1_ = -1;
  uint64_t pixels_written_ = 0;
};

} // namespace jwsim::models

#endif
