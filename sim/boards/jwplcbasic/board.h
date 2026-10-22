// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Placa virtual JWPLC Basic (v2): conexiones entre el ESP32 simulado y los
// modelos de periféricos, más las señales de bornera.
//
// Cableado modelado en G0 (fuente: variants/jwplcbasic/pins_is.h y
// cores/jwcontrol/jwplc_hardware_config.h del package; supuestos de placa
// confirmados por JW Control en docs/ARCHITECTURE.md §5):
//   I2C0 (SDA=21, SCL=22) ── TCA6424A @0x22
//   I0_k  ── acondicionamiento de entrada ── TCA6424A P0(7-k)
//   TCA6424A P1k ── driver de relé (habilitado por EN_IO=GPIO27) ── Q0_k
//   UART0 (TX=1) ── consola
//   VSPI ── ST7789 (CS33), microSD (CS32, detección GPIO39), FRAM (CS13),
//           W5500 (CS5, sin modelo hasta alpha.13)
#ifndef JWSIM_BOARD_JWPLCBASIC_H
#define JWSIM_BOARD_JWPLCBASIC_H

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/models/ds3232m.h"
#include "jwsim/models/mb85rs64v.h"
#include "jwsim/models/sdcard.h"
#include "jwsim/models/st7789.h"
#include "jwsim/models/tca6424a.h"

namespace jwsim::boards {

class JwplcBasic : public Board {
 public:
  JwplcBasic();

  const char *name() const override { return "JWPLC Basic"; }
  I2CBus *i2c_bus(int port) override { return port == 0 ? &i2c0_ : nullptr; }
  SPIBus *spi_bus(int host) override { return host == 3 ? &vspi_ : nullptr; }
  Net *signal(const std::string &name) override;
  std::vector<std::string> signal_names() const override { return order_; }
  void uart_tx(int port, const uint8_t *data, size_t len) override;

  // Registro de eventos de bornera en consola (desactivable con --quiet).
  void set_echo(bool echo) { echo_ = echo; }
  // Bytes crudos que el firmware transmite por cada UART (modo interactivo).
  using UartSink = std::function<void(int port, const uint8_t *data, size_t len)>;
  void set_uart_sink(UartSink sink) { uart_sink_ = std::move(sink); }
  // Transceptor RS-485 (MAX13487E con auto-dirección) en UART2: cada
  // carácter que sale al bus con su [inicio, fin].
  using UartLink = std::function<void(int port, uint8_t byte, jwsim_ns_t start, jwsim_ns_t end)>;
  void set_uart_link(UartLink link) { uart_link_ = std::move(link); }
  void uart_char(int port, uint8_t byte, jwsim_ns_t start, jwsim_ns_t end) override {
    if (uart_link_) uart_link_(port, byte, start, end);
  }
  uint8_t inputs() const;    // bit k = I0_k
  uint8_t outputs() const;   // bit k = Q0_k
  void flush_console();

  models::TCA6424A &expander() { return tca_; }
  models::MB85RS64V &fram() { return fram_; }
  models::DS3232M &rtc() { return rtc_; }
  models::ST7789 &tft() { return *tft_; }
  models::SdCard &sd() { return sd_; }

  // Estado persistente de la placa (FRAM, NVS, SD...) en `dir`; sin llamar,
  // todo es volátil. save_state() escribe lo que cambió.
  void set_state_dir(const std::string &dir);
  void save_state();

  // Estado que conserva un reinicio del ESP32 (esp_restart): lo que no es
  // el ESP32 sigue alimentado (expansor, pantalla, entradas y forzados de la
  // interfaz). FRAM, NVS y RTC van por set_state_dir().
  void save_warm(models::StateWriter &w) const;
  bool load_warm(models::StateReader &r);

 private:
  Net &add_signal(const std::string &name, bool idle);
  void update_relays();
  void update_buttons();
  void log_signal(const Net &net, bool level);

  I2CBus i2c0_{"I2C0"};
  SPIBus vspi_{"VSPI"};
  models::TCA6424A tca_{"U_TCA6424A", 0x22};
  models::MB85RS64V fram_;
  models::DS3232M rtc_;
  models::SdCard sd_;
  std::unique_ptr<models::ST7789> tft_;
  std::map<std::string, std::unique_ptr<Net>> signals_;
  std::vector<std::string> order_;
  std::string console_line_[3];
  bool echo_ = true;
  UartSink uart_sink_;
  UartLink uart_link_;
};

} // namespace jwsim::boards

#endif
