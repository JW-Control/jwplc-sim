// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "jwsim/models/st7789.h"

#include <algorithm>

namespace jwsim::models {

ST7789::ST7789(Net &dc, Net *reset_n, Panel panel) : dc_(dc), panel_(panel), gram_(static_cast<size_t>(kGramW) * kGramH, 0) {
  reset();
  // RESX (activo en bajo): un pulso bajo reinicia el controlador.
  if (reset_n) reset_n->on_change([this](Net &, bool level) {
    if (!level) reset();
  });
}

void ST7789::reset() {
  madctl_ = 0;
  colmod_ = 0x66;
  inversion_ = false;
  display_on_ = false;
  sleeping_ = true;
  xs_ = 0;
  xe_ = kGramW - 1;
  ys_ = 0;
  ye_ = kGramH - 1;
  cmd_ = NOP;
  nparam_ = 0;
  have_hi_ = false;
  mark_all();
}

void ST7789::mark_all() {
  dx0_ = 0;
  dy0_ = 0;
  dx1_ = view_width() - 1;
  dy1_ = view_height() - 1;
}

void ST7789::mark(int px, int py) {
  // Memoria (px, py) → vista (X, Y): X = 319 - py, Y = px - x0.
  const int x = kGramH - 1 - py, y = px - panel_.x0;
  if (y < 0 || y >= panel_.w || x < 0 || x >= view_width()) return;
  dx0_ = std::min(dx0_, x);
  dy0_ = std::min(dy0_, y);
  dx1_ = std::max(dx1_, x);
  dy1_ = std::max(dy1_, y);
}

bool ST7789::take_dirty(int &x, int &y, int &w, int &h) {
  if (dx1_ < dx0_) return false;
  x = dx0_;
  y = dy0_;
  w = dx1_ - dx0_ + 1;
  h = dy1_ - dy0_ + 1;
  dx0_ = dy0_ = 1 << 30;
  dx1_ = dy1_ = -1;
  return true;
}

uint16_t ST7789::view_pixel(int x, int y) const {
  if (!display_on()) return 0;
  const int px = panel_.x0 + y, py = kGramH - 1 - x;
  uint16_t v = gram_[static_cast<size_t>(py) * kGramW + px];
  // El panel muestra bien los colores con su BGR e inversión de fábrica.
  if (((madctl_ & MAD_BGR) != 0) != panel_.bgr) v = static_cast<uint16_t>((v & 0x07E0) | (v >> 11) | ((v & 0x1F) << 11));
  if (inversion_ != panel_.inverted) v = static_cast<uint16_t>(~v);
  return v;
}

void ST7789::spi_select(bool selected) {
  // Al bajar CS la interfaz se resincroniza; un comando en curso continúa
  // (el driver puede enviar comando y datos en ciclos de CS distintos).
  if (selected) have_hi_ = false;
}

uint8_t ST7789::spi_transfer(uint8_t mosi) {
  if (!dc_.level()) command(mosi);
  else param(mosi);
  return 0xFF;  // lectura no modelada (SDO compartido)
}

void ST7789::command(uint8_t cmd) {
  cmd_ = cmd;
  nparam_ = 0;
  have_hi_ = false;
  switch (cmd) {
    case SWRESET: reset(); break;
    case SLPIN: sleeping_ = true; mark_all(); break;
    case SLPOUT: sleeping_ = false; mark_all(); break;
    case INVOFF: inversion_ = false; mark_all(); break;
    case INVON: inversion_ = true; mark_all(); break;
    case DISPOFF: display_on_ = false; mark_all(); break;
    case DISPON: display_on_ = true; mark_all(); break;
    case RAMWR: ca_ = xs_; ra_ = ys_; break;
    default: break;
  }
}

void ST7789::param(uint8_t b) {
  switch (cmd_) {
    case CASET:
    case RASET:
      if (nparam_ < 4) params_[nparam_++] = b;
      if (nparam_ == 4) {
        const int s = (params_[0] << 8) | params_[1], e = (params_[2] << 8) | params_[3];
        if (cmd_ == CASET) { xs_ = s; xe_ = e; } else { ys_ = s; ye_ = e; }
      }
      break;
    case MADCTL:
      madctl_ = b;
      mark_all();
      break;
    case COLMOD:
      colmod_ = b;
      break;
    case RAMWR:
    case RAMWRC:
      // 16 bits por píxel (COLMOD 0x55), MSB primero.
      if (!have_hi_) {
        hi_ = b;
        have_hi_ = true;
      } else {
        have_hi_ = false;
        pixel(static_cast<uint16_t>((hi_ << 8) | b));
      }
      break;
    default:
      break;  // parámetros de configuración analógica (PORCTRL, VCOMS...): sin efecto visible
  }
}

void ST7789::pixel(uint16_t rgb) {
  // Contadores de columna/página → memoria según MADCTL (MV intercambia,
  // MX/MY invierten el sentido de cada contador).
  const bool mv = madctl_ & MAD_MV, mx = madctl_ & MAD_MX, my = madctl_ & MAD_MY;
  int px, py;
  if (!mv) {
    px = mx ? kGramW - 1 - ca_ : ca_;
    py = my ? kGramH - 1 - ra_ : ra_;
  } else {
    py = mx ? kGramH - 1 - ca_ : ca_;
    px = my ? kGramW - 1 - ra_ : ra_;
  }
  if (px >= 0 && px < kGramW && py >= 0 && py < kGramH) {
    gram_[static_cast<size_t>(py) * kGramW + px] = rgb;
    mark(px, py);
  }
  ++pixels_written_;
  if (++ca_ > xe_) {
    ca_ = xs_;
    if (++ra_ > ye_) ra_ = ys_;
  }
}

void ST7789::save_warm(StateWriter &w) const {
  w.u8(madctl_);
  w.u8(colmod_);
  w.u8(static_cast<uint8_t>(inversion_ | display_on_ << 1 | sleeping_ << 2));
  for (int v : {xs_, xe_, ys_, ye_, ca_, ra_}) w.u16(static_cast<uint16_t>(v));
  w.u8(cmd_);
  w.u8(static_cast<uint8_t>(nparam_));
  w.bytes(params_, sizeof(params_));
  w.u8(static_cast<uint8_t>(have_hi_));
  w.u8(hi_);
  w.u64(pixels_written_);
  w.bytes(gram_.data(), gram_.size() * sizeof(uint16_t));
}

void ST7789::load_warm(StateReader &r) {
  madctl_ = r.u8();
  colmod_ = r.u8();
  const uint8_t f = r.u8();
  inversion_ = f & 1;
  display_on_ = f & 2;
  sleeping_ = f & 4;
  for (int *v : {&xs_, &xe_, &ys_, &ye_, &ca_, &ra_}) *v = r.u16();
  cmd_ = r.u8();
  nparam_ = r.u8();
  r.bytes(params_, sizeof(params_));
  have_hi_ = r.u8() != 0;
  hi_ = r.u8();
  pixels_written_ = r.u64();
  r.bytes(gram_.data(), gram_.size() * sizeof(uint16_t));
  mark_all();
}

} // namespace jwsim::models
