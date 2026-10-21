#include "jwsim/models/tca6424a.h"

#include <cstdio>

namespace jwsim::models {

namespace {
int bank_of(uint8_t r) { return r & 0x03; }
int group_of(uint8_t r) { return (r >> 2) & 0x03; }   // 0=Input, 1=Output, 2=Polarity, 3=Config
} // namespace

TCA6424A::TCA6424A(std::string name, uint8_t address)
    : name_(std::move(name)), address_(address), int_n_(name_ + ".INT", true), reset_n_(name_ + ".RESET", true) {
  for (int i = 0; i < kPins; ++i) {
    char label[16];
    std::snprintf(label, sizeof(label), ".P%d%d", i / 8, i % 8);
    // Sin pull-ups internos: una entrada sin manejar queda en el nivel de
    // reposo que defina la placa (Net::set_idle).
    pins_[i] = std::make_unique<Net>(name_ + label, true);
    pins_[i]->on_change([this](Net &, bool) {
      if (!driving_) update_interrupt();
    });
  }
  reset_n_.on_change([this](Net &, bool level) {
    in_reset_ = !level;
    if (in_reset_) power_on_reset();
  });
  power_on_reset();
}

void TCA6424A::power_on_reset() {
  // Valores por defecto (datasheet §8.6 Register Maps): Output=0xFF,
  // Polarity=0x00, Configuration=0xFF (todos los pines como entrada).
  for (int b = 0; b < 3; ++b) {
    output_[b] = 0xFF;
    polarity_[b] = 0x00;
    config_[b] = 0xFF;
  }
  command_ = 0;
  have_command_ = false;
  reading_ = false;
  apply_outputs();
  for (int b = 0; b < 3; ++b) input_snapshot_[b] = input_port(b);
  update_interrupt();
}

uint8_t TCA6424A::input_port(int bank) const {
  uint8_t v = 0;
  for (int bit = 0; bit < 8; ++bit) {
    if (pins_[bank * 8 + bit]->level()) v |= static_cast<uint8_t>(1u << bit);
  }
  // La inversión de polaridad aplica a los pines configurados como entrada.
  return static_cast<uint8_t>(v ^ (polarity_[bank] & config_[bank]));
}

uint8_t TCA6424A::reg(uint8_t r) const {
  const int b = bank_of(r);
  if (b > 2) return 0xFF;
  switch (group_of(r)) {
    case 0: return input_port(b);
    case 1: return output_[b];
    case 2: return polarity_[b];
    default: return config_[b];
  }
}

void TCA6424A::write_reg(uint8_t r, uint8_t v) {
  const int b = bank_of(r);
  if (b > 2) return;
  switch (group_of(r)) {
    case 0: break;   // Input Port: solo lectura, la escritura se ignora
    case 1: output_[b] = v; break;
    case 2: polarity_[b] = v; break;
    default: config_[b] = v; break;
  }
  apply_outputs();
  update_interrupt();
}

void TCA6424A::apply_outputs() {
  driving_ = true;
  for (int i = 0; i < kPins; ++i) {
    const int b = i / 8;
    const uint8_t mask = static_cast<uint8_t>(1u << (i % 8));
    if (config_[b] & mask) {
      pins_[i]->release(this);                     // entrada: alta impedancia
    } else {
      pins_[i]->drive(this, (output_[b] & mask) != 0);  // salida push-pull
    }
  }
  driving_ = false;
}

void TCA6424A::update_interrupt() {
  bool pending = false;
  for (int b = 0; b < 3; ++b) {
    const uint8_t changed = static_cast<uint8_t>((input_port(b) ^ input_snapshot_[b]) & config_[b]);
    if (changed) pending = true;
  }
  if (pending) int_n_.drive(this, false);   // drenador abierto: tira a bajo
  else int_n_.release(this);
}

void TCA6424A::advance_pointer() {
  if (!(command_ & 0x80)) return;   // AI = 0: el puntero no avanza
  // AI = 1: avanza dentro del grupo de 3 registros y vuelve al primero.
  const uint8_t base = command_ & 0x7C;
  uint8_t bank = static_cast<uint8_t>((command_ & 0x03) + 1);
  if (bank > 2) bank = 0;
  command_ = static_cast<uint8_t>(0x80 | base | bank);
}

bool TCA6424A::i2c_start(bool read) {
  if (in_reset_) return false;
  reading_ = read;
  if (!read) have_command_ = false;
  return true;
}

bool TCA6424A::i2c_write(uint8_t byte) {
  if (in_reset_) return false;
  if (!have_command_) {
    command_ = byte;
    have_command_ = true;
    return true;
  }
  write_reg(command_ & 0x7F, byte);
  advance_pointer();
  return true;
}

uint8_t TCA6424A::i2c_read(bool) {
  const uint8_t r = command_ & 0x7F;
  const uint8_t v = reg(r);
  if (group_of(r) == 0 && bank_of(r) <= 2) {
    // Leer el Input Port borra la interrupción de ese puerto.
    input_snapshot_[bank_of(r)] = input_port(bank_of(r));
    update_interrupt();
  }
  advance_pointer();
  return v;
}

void TCA6424A::i2c_stop() { reading_ = false; }

} // namespace jwsim::models
