// Modelo del expansor de E/S I2C TCA6424A (Texas Instruments, SCPS193).
//
// Modelado contra el datasheet, no contra el driver del package. Ver
// sim/models/tca6424a/MODEL.md para la tabla de comportamiento, las
// referencias a secciones del datasheet y los puntos pendientes de verificar.
#ifndef JWSIM_MODELS_TCA6424A_H
#define JWSIM_MODELS_TCA6424A_H

#include <array>
#include <cstdint>
#include <memory>
#include <string>

#include "jwsim/devices.h"

namespace jwsim::models {

class TCA6424A : public I2CTarget {
 public:
  static constexpr int kPins = 24;

  // Registros (comando[6:0]); bit 7 del comando = auto-incremento (AI).
  enum Reg : uint8_t {
    INPUT0 = 0x00, INPUT1 = 0x01, INPUT2 = 0x02,
    OUTPUT0 = 0x04, OUTPUT1 = 0x05, OUTPUT2 = 0x06,
    POLARITY0 = 0x08, POLARITY1 = 0x09, POLARITY2 = 0x0A,
    CONFIG0 = 0x0C, CONFIG1 = 0x0D, CONFIG2 = 0x0E,
  };

  // `address` es 0x22 (ADDR=L) o 0x23 (ADDR=H). `name` identifica las redes.
  TCA6424A(std::string name, uint8_t address);

  uint8_t address() const { return address_; }

  // Red del pin P<bank><bit> (índice 0..23 = P00..P07, P10..P17, P20..P27).
  Net &pin(int index) { return *pins_[index]; }
  // Salida de interrupción INT (drenador abierto, activa en bajo).
  Net &int_n() { return int_n_; }
  // Entrada RESET (activa en bajo). En bajo, todos los registros vuelven a
  // su valor por defecto y el bus I2C no responde.
  Net &reset_n() { return reset_n_; }

  // Estado interno (observación/depuración).
  uint8_t reg(uint8_t r) const;

  // I2CTarget
  bool i2c_start(bool read) override;
  bool i2c_write(uint8_t byte) override;
  uint8_t i2c_read(bool ack) override;
  void i2c_stop() override;

 private:
  void power_on_reset();
  uint8_t input_port(int bank) const;
  void write_reg(uint8_t r, uint8_t v);
  void apply_outputs();
  void advance_pointer();
  void update_interrupt();

  std::string name_;
  uint8_t address_;
  std::array<std::unique_ptr<Net>, kPins> pins_;
  Net int_n_;
  Net reset_n_;

  uint8_t output_[3]{};
  uint8_t polarity_[3]{};
  uint8_t config_[3]{};
  uint8_t input_snapshot_[3]{};   // valor de entrada en la última lectura (para INT)

  uint8_t command_ = 0;
  bool have_command_ = false;
  bool reading_ = false;
  bool in_reset_ = false;
  bool driving_ = false;          // evita reentrada al manejar las redes propias
};

} // namespace jwsim::models

#endif
