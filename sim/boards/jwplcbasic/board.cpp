// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "board.h"

#include <cstdio>

namespace jwsim::boards {

namespace {
constexpr int kEnIoGpio = 27;      // EN_IO en pins_is.h
constexpr int kSdDetectGpio = 39;  // JWPLC_SD_DETECT_PIN en jwplc_hardware_config.h
constexpr int kEthIntGpio = 15;    // JWPLC_ETH_INT_PIN en jwplc_hardware_config.h
// Bus SPI compartido (VSPI): CS y D/C de jwplc_spi_bus.h.
constexpr int kTftCsGpio = 33;
constexpr int kTftDcGpio = 25;
constexpr int kSdCsGpio = 32;
constexpr int kFramCsGpio = 13;
constexpr int kEthCsGpio = 5;

double now_ms() { return static_cast<double>(jwsim_now()) / 1e6; }
} // namespace

JwplcBasic::JwplcBasic() {
  i2c0_.attach(tca_.address(), &tca_);
  // Chips del bus SPI para el analizador (los modelos llegan en G4).
  vspi_.name_chip(gpio(kTftCsGpio), "TFT", &gpio(kTftDcGpio));
  vspi_.name_chip(gpio(kSdCsGpio), "SD");
  vspi_.name_chip(gpio(kFramCsGpio), "FRAM");
  vspi_.attach(gpio(kFramCsGpio), &fram_);
  vspi_.name_chip(gpio(kEthCsGpio), "W5500");

  // Entradas digitales: 0 V en reposo. Acondicionamiento no inversor
  // (entrada activa => pin del TCA en alto; confirmado por JW Control). El
  // core solo invierte el orden de bits (I0_0 = P07), no la lógica.
  for (int k = 0; k < 8; ++k) {
    Net &in = add_signal("I0_" + std::to_string(k), false);
    Net &pin = tca_.pin(7 - k);
    pin.drive(this, in.level());
    in.on_change([&pin, this](Net &net, bool level) {
      pin.drive(this, level);
      log_signal(net, level);
    });
  }

  // Salidas a relé: bobina energizada si EN_IO=1 (habilitación de los
  // drivers, confirmado por JW Control) y el pin P1k está en alto.
  for (int k = 0; k < 8; ++k) {
    Net &q = add_signal("Q0_" + std::to_string(k), false);
    q.on_change([this](Net &net, bool level) { log_signal(net, level); });
    tca_.pin(8 + k).on_change([this](Net &, bool) { update_relays(); });
  }
  // Puerto 2 del expansor sin uso en Basic v2: queda en reposo alto.
  for (int i = 16; i < 24; ++i) tca_.pin(i).set_idle(true);

  // Pull-ups externos de la placa (líneas activas en bajo):
  //  - GPIO39 detección de microSD (JWPLC_SD_DETECT_PIN): alto = sin tarjeta.
  //  - GPIO15 INTn del W5500 (JWPLC_ETH_INT_PIN).
  gpio(kSdDetectGpio).set_idle(true);
  gpio(kEthIntGpio).set_idle(true);

  gpio(kEnIoGpio).on_change([this](Net &, bool) { update_relays(); });
  update_relays();
  set_board(this);
}

Net &JwplcBasic::add_signal(const std::string &name, bool idle) {
  auto net = std::make_unique<Net>(name, idle);
  Net &ref = *net;
  signals_[name] = std::move(net);
  order_.push_back(name);
  return ref;
}

Net *JwplcBasic::signal(const std::string &name) {
  auto it = signals_.find(name);
  return it == signals_.end() ? nullptr : it->second.get();
}

void JwplcBasic::update_relays() {
  const bool enabled = gpio(kEnIoGpio).level();
  for (int k = 0; k < 8; ++k) {
    const bool coil = enabled && tca_.pin(8 + k).level();
    signals_["Q0_" + std::to_string(k)]->drive(this, coil);
  }
}

void JwplcBasic::log_signal(const Net &net, bool level) {
  uint8_t rec[2] = {'B', static_cast<uint8_t>(level)};
  jwsim_trace_bytes(net.name().data(), net.name().size());
  jwsim_trace_bytes(rec, sizeof(rec));
  jwsim_trace_u64(jwsim_now());
  if (echo_) std::printf("[%10.3f ms] %-5s %s = %d\n", now_ms(), net.name()[0] == 'I' ? "DI" : "DO", net.name().c_str(), level);
}

uint8_t JwplcBasic::inputs() const {
  uint8_t v = 0;
  for (int k = 0; k < 8; ++k) {
    if (signals_.at("I0_" + std::to_string(k))->level()) v |= static_cast<uint8_t>(1u << k);
  }
  return v;
}

uint8_t JwplcBasic::outputs() const {
  uint8_t v = 0;
  for (int k = 0; k < 8; ++k) {
    if (signals_.at("Q0_" + std::to_string(k))->level()) v |= static_cast<uint8_t>(1u << k);
  }
  return v;
}

void JwplcBasic::uart_tx(int port, const uint8_t *data, size_t len) {
  if (port < 0 || port > 2) return;
  if (uart_sink_) uart_sink_(port, data, len);
  std::string &line = console_line_[port];
  for (size_t i = 0; i < len; ++i) {
    const char c = static_cast<char>(data[i]);
    if (c == '\n') {
      if (echo_) std::printf("[%10.3f ms] UART%d %s\n", now_ms(), port, line.c_str());
      line.clear();
    } else if (c != '\r') {
      line.push_back(c);
    }
  }
}

void JwplcBasic::flush_console() {
  for (int p = 0; p < 3; ++p) {
    if (!console_line_[p].empty()) {
      if (echo_) std::printf("[%10.3f ms] UART%d %s\n", now_ms(), p, console_line_[p].c_str());
      console_line_[p].clear();
    }
  }
}

} // namespace jwsim::boards

namespace jwsim::boards {

void JwplcBasic::set_state_dir(const std::string &dir) { fram_.set_storage(dir); }

void JwplcBasic::save_state() {
  if (!fram_.save()) std::fprintf(stderr, "[jwsim] no se pudo guardar la FRAM en el directorio de estado\n");
}

} // namespace jwsim::boards
