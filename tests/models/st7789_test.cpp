// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del modelo ST7789, sin firmware: una prueba por fila de
// sim/models/st7789/MODEL.md (gate JWSIM_G4_TFT_HMI).
#include <cstdio>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/models/st7789.h"
#include "test_util.h"

using jwsim::Net;
using jwsim::SPIBus;
using jwsim::models::ST7789;

namespace {

struct Fixture {
  SPIBus bus{"VSPI"};
  Net cs{"CS", true}, dc{"DC", true}, rst{"RST", true};
  ST7789 lcd{dc, &rst, ST7789::Panel{}};
  Fixture() { bus.attach(cs, &lcd); }

  void cmd(uint8_t c, std::vector<uint8_t> params = {}) {
    cs.drive(false);
    dc.drive(false);
    bus.transfer(c);
    dc.drive(true);
    for (uint8_t p : params) bus.transfer(p);
    cs.drive(true);
  }
  void window(int x0, int x1, int y0, int y1) {
    cmd(ST7789::CASET, {uint8_t(x0 >> 8), uint8_t(x0), uint8_t(x1 >> 8), uint8_t(x1)});
    cmd(ST7789::RASET, {uint8_t(y0 >> 8), uint8_t(y0), uint8_t(y1 >> 8), uint8_t(y1)});
  }
  void fill(std::vector<uint16_t> px) {
    std::vector<uint8_t> b;
    for (uint16_t p : px) {
      b.push_back(uint8_t(p >> 8));
      b.push_back(uint8_t(p));
    }
    cmd(ST7789::RAMWR, b);
  }
  void on() {
    cmd(ST7789::SLPOUT);
    cmd(ST7789::DISPON);
  }
};

} // namespace

TEST(fila01_ventana_y_ramwr) {
  Fixture f;
  f.window(10, 11, 20, 21);
  f.fill({0x1111, 0x2222, 0x3333, 0x4444});
  CHECK_EQ(f.lcd.gram(10, 20), 0x1111);
  CHECK_EQ(f.lcd.gram(11, 20), 0x2222);
  CHECK_EQ(f.lcd.gram(10, 21), 0x3333);
  CHECK_EQ(f.lcd.gram(11, 21), 0x4444);
}

TEST(fila02_vuelta_al_inicio_de_ventana) {
  Fixture f;
  f.window(0, 0, 0, 1);
  f.fill({1, 2, 3});  // el tercero vuelve a (0,0)
  CHECK_EQ(f.lcd.gram(0, 0), 3);
  CHECK_EQ(f.lcd.gram(0, 1), 2);
}

TEST(fila03_madctl_mv_mx) {
  Fixture f;
  f.cmd(ST7789::MADCTL, {ST7789::MAD_MV | ST7789::MAD_MX});
  f.window(0, 0, 50, 50);  // columna lógica 0, página 50
  f.fill({0xABCD});
  // MV: la columna lógica recorre filas; MX la invierte → fila 319.
  CHECK_EQ(f.lcd.gram(50, 319), 0xABCD);
}

TEST(fila04_madctl_my) {
  Fixture f;
  f.cmd(ST7789::MADCTL, {ST7789::MAD_MY});
  f.window(5, 5, 0, 0);
  f.fill({0x7777});
  CHECK_EQ(f.lcd.gram(5, 319), 0x7777);
}

TEST(fila05_comando_y_datos_en_ciclos_de_cs_distintos) {
  Fixture f;
  f.window(3, 3, 4, 4);
  // RAMWR y luego los datos en otro ciclo de CS: el comando sigue vigente.
  f.cmd(ST7789::RAMWR);
  f.cs.drive(false);
  f.dc.drive(true);
  f.bus.transfer(0x12);
  f.bus.transfer(0x34);
  f.cs.drive(true);
  CHECK_EQ(f.lcd.gram(3, 4), 0x1234);
}

TEST(fila06_vista_horizontal_inversion_y_bgr) {
  Fixture f;
  f.on();
  // Con BGR = 1 e INVON (como envía TFT_eSPI para este panel) el color se ve tal cual.
  f.cmd(ST7789::MADCTL, {ST7789::MAD_MV | ST7789::MAD_MX | ST7789::MAD_BGR});
  f.cmd(ST7789::INVON);
  f.window(0, 0, 35, 35);  // esquina superior izquierda de la vista (offset 35 del panel)
  f.fill({0xF800});
  CHECK_EQ(f.lcd.view_pixel(0, 0), 0xF800);
  // Sin INVON el panel IPS muestra el color invertido.
  f.cmd(ST7789::INVOFF);
  CHECK_EQ(f.lcd.view_pixel(0, 0), static_cast<uint16_t>(~0xF800));
  // Sin BGR se intercambian rojo y azul.
  f.cmd(ST7789::INVON);
  f.cmd(ST7789::MADCTL, {ST7789::MAD_MV | ST7789::MAD_MX});
  CHECK_EQ(f.lcd.view_pixel(0, 0), 0x001F);
}

TEST(fila07_apagada_o_dormida_se_ve_negra) {
  Fixture f;
  f.window(35, 35, 319, 319);
  f.fill({0xFFFF});
  CHECK_EQ(f.lcd.view_pixel(0, 0), 0);  // dormida tras el reset
  f.on();
  f.cmd(ST7789::INVON);
  f.cmd(ST7789::MADCTL, {ST7789::MAD_BGR});
  CHECK_EQ(f.lcd.view_pixel(0, 0), 0xFFFF);
  f.cmd(ST7789::DISPOFF);
  CHECK_EQ(f.lcd.view_pixel(0, 0), 0);
}

TEST(fila08_reset_por_pin) {
  Fixture f;
  f.on();
  f.cmd(ST7789::MADCTL, {0xC0});
  f.rst.drive(false);
  f.rst.drive(true);
  CHECK_EQ(f.lcd.madctl(), 0);
  CHECK(!f.lcd.display_on());
}

TEST(fila09_zona_sucia) {
  Fixture f;
  int x, y, w, h;
  f.lcd.take_dirty(x, y, w, h);  // descarta el "todo sucio" del reset
  f.window(40, 41, 300, 300);
  f.fill({1, 2});
  CHECK(f.lcd.take_dirty(x, y, w, h));
  CHECK_EQ(x, 19);  // fila 300 → X = 319 - 300
  CHECK_EQ(y, 5);   // columnas 40..41 → Y = 5..6
  CHECK_EQ(w, 1);
  CHECK_EQ(h, 2);
  CHECK(!f.lcd.take_dirty(x, y, w, h));
}

int main() { return run_all_tests("ST7789"); }
