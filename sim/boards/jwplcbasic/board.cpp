// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "board.h"

#include <cstdio>

#include "nvs.h"

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
constexpr int kTftRstGpio = 14;
// Botonera frontal (JWPLC_GlobalPeripherals.cpp): matriz 2 × 3. La fila
// activa se pone en alto y la columna lee alto con la tecla pulsada (diodos
// y pull-downs de la placa: sin tecla, las columnas leen bajo).
constexpr int kBtnRows[2] = {12, 2};
constexpr int kBtnCols[3] = {35, 34, 36};
constexpr const char *kBtnNames[2][3] = {{"BTN_LEFT", "BTN_UP", "BTN_RIGHT"}, {"BTN_ESC", "BTN_OK", "BTN_DOWN"}};

double now_ms() { return static_cast<double>(jwsim_now()) / 1e6; }
} // namespace

JwplcBasic::JwplcBasic() {
  i2c0_.attach(tca_.address(), &tca_);
  i2c0_.attach(models::DS3232M::kAddress, &rtc_);
  // Chips del bus SPI para el analizador (los modelos llegan en G4).
  vspi_.name_chip(gpio(kTftCsGpio), "TFT", &gpio(kTftDcGpio));
  tft_ = std::make_unique<models::ST7789>(gpio(kTftDcGpio), &gpio(kTftRstGpio), models::ST7789::Panel{});
  vspi_.attach(gpio(kTftCsGpio), tft_.get());
  vspi_.name_chip(gpio(kSdCsGpio), "SD");
  vspi_.attach(gpio(kSdCsGpio), &sd_);
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

  // microSD: señal "SD_CARD" (1 = insertada, como viene la placa). El
  // interruptor del zócalo lleva GPIO39 a bajo con la tarjeta puesta.
  add_signal("SD_CARD", true).on_change([this](Net &net, bool level) {
    log_signal(net, level);
    sd_.set_inserted(level);
    if (level) gpio(kSdDetectGpio).drive(&sd_, false);
    else gpio(kSdDetectGpio).release(&sd_);
  });
  gpio(kSdDetectGpio).drive(&sd_, false);

  // Botones: señales de bornera "BTN_*" (1 = pulsado), como las entradas.
  for (int r = 0; r < 2; ++r) {
    for (int c = 0; c < 3; ++c) {
      add_signal(kBtnNames[r][c], false).on_change([this](Net &net, bool level) {
        log_signal(net, level);
        update_buttons();
      });
    }
    gpio(kBtnRows[r]).on_change([this](Net &, bool) { update_buttons(); });
  }
  for (int c : kBtnCols) gpio(c).set_idle(false);
  update_buttons();

  gpio(kEnIoGpio).on_change([this](Net &, bool) { update_relays(); });
  update_relays();
  set_board(this);
}

void JwplcBasic::set_ethernet(bool present) {
  if (!present || eth_present_) return;
  eth_present_ = true;
  vspi_.attach(gpio(kEthCsGpio), &eth_);
  eth_.set_int_net(&gpio(kEthIntGpio));
  eth_.set_scheduler([](jwsim_ns_t at, std::function<void()> fn) {
    auto *f = new std::function<void()>(std::move(fn));
    jwsim_schedule_event(at, [](void *arg, jwsim_ns_t) {
      auto *g = static_cast<std::function<void()> *>(arg);
      (*g)();
      delete g;
    }, f);
  });
  add_signal("ETH_CABLE", true).on_change([this](Net &net, bool level) {
    log_signal(net, level);
    eth_.set_cable(level);
  });
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

void JwplcBasic::update_buttons() {
  for (int c = 0; c < 3; ++c) {
    bool level = false;
    for (int r = 0; r < 2; ++r) level = level || (gpio(kBtnRows[r]).level() && signals_[kBtnNames[r][c]]->level());
    gpio(kBtnCols[c]).drive(this, level);
  }
}

void JwplcBasic::log_signal(const Net &net, bool level) {
  uint8_t rec[2] = {'B', static_cast<uint8_t>(level)};
  jwsim_trace_bytes(net.name().data(), net.name().size());
  jwsim_trace_bytes(rec, sizeof(rec));
  jwsim_trace_u64(jwsim_now());
  const char *kind = net.name()[0] == 'I' ? "DI" : net.name()[0] == 'Q' ? "DO" : net.name()[0] == 'S' ? "SD" : net.name()[0] == 'E' ? "ETH" : "BTN";
  if (echo_) std::printf("[%10.3f ms] %-5s %s = %d\n", now_ms(), kind, net.name().c_str(), level);
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

void JwplcBasic::set_state_dir(const std::string &dir) {
  fram_.set_storage(dir);
  sd_.set_storage(dir);
  rtc_.set_storage(dir);
  jwsim_nvs_set_storage(dir.c_str());
}

void JwplcBasic::save_state() {
  if (!fram_.save()) std::fprintf(stderr, "[jwsim] no se pudo guardar la FRAM en el directorio de estado\n");
  if (!rtc_.save()) std::fprintf(stderr, "[jwsim] no se pudo guardar el RTC en el directorio de estado\n");
  if (!jwsim_nvs_save()) std::fprintf(stderr, "[jwsim] no se pudo guardar la NVS en el directorio de estado\n");
  if (!sd_.save()) std::fprintf(stderr, "[jwsim] no se pudo guardar la tarjeta microSD en el directorio de estado\n");
}

void JwplcBasic::save_warm(models::StateWriter &w) const {
  w.u32(static_cast<uint32_t>(order_.size()));
  for (const std::string &name : order_) {
    const Net &n = *signals_.at(name);
    w.str(name);
    w.u8(static_cast<uint8_t>(n.external_level() + 1));
    w.u8(static_cast<uint8_t>(n.forced_level() + 1));
  }
  tca_.save_warm(w);
  tft_->save_warm(w);
}

bool JwplcBasic::load_warm(models::StateReader &r) {
  const uint32_t n = r.u32();
  for (uint32_t i = 0; i < n && r.ok(); ++i) {
    const std::string name = r.str();
    const int ext = r.u8() - 1;
    const int forced = r.u8() - 1;
    Net *net = signal(name);
    if (!net) continue;
    if (ext >= 0) net->drive(ext == 1);
    if (forced >= 0) net->force(forced == 1);
  }
  tca_.load_warm(r);
  tft_->load_warm(r);
  return r.ok();
}

} // namespace jwsim::boards
