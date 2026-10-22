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
#ifndef JWSIM_BOARD_JWPLCBASIC_H
#define JWSIM_BOARD_JWPLCBASIC_H

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/models/mb85rs64v.h"
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
  uint8_t inputs() const;    // bit k = I0_k
  uint8_t outputs() const;   // bit k = Q0_k
  void flush_console();

  models::TCA6424A &expander() { return tca_; }
  models::MB85RS64V &fram() { return fram_; }

  // Estado persistente de la placa (FRAM, NVS, SD...) en `dir`; sin llamar,
  // todo es volátil. save_state() escribe lo que cambió.
  void set_state_dir(const std::string &dir);
  void save_state();

 private:
  Net &add_signal(const std::string &name, bool idle);
  void update_relays();
  void log_signal(const Net &net, bool level);

  I2CBus i2c0_{"I2C0"};
  SPIBus vspi_{"VSPI"};
  models::TCA6424A tca_{"U_TCA6424A", 0x22};
  models::MB85RS64V fram_;
  std::map<std::string, std::unique_ptr<Net>> signals_;
  std::vector<std::string> order_;
  std::string console_line_[3];
  bool echo_ = true;
  UartSink uart_sink_;
};

} // namespace jwsim::boards

#endif
