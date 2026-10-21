// JWPLC Sim — interfaz de dispositivos (C++).
//
// Contrato común para modelos de periféricos (TCA6424A, DS3232M, FRAM, W5500,
// ST7789, SD, ...) y para la placa virtual. Los modelos se escriben contra el
// datasheet, a nivel de pines y transacciones de bus, y no conocen el HAL: así
// pueden reutilizarse desde el modo HAL nativo, desde el puente QEMU (proceso
// separado) y desde HIL.
//
// Puertos:
//   - Net         : señal digital (nivel lógico + si está siendo manejada).
//   - I2CTarget   : dispositivo esclavo I2C (eventos START/byte/STOP).
//   - SPITarget   : dispositivo esclavo SPI (selección por CS + byte a byte).
//   - UART        : (G4) flujo de bytes con baudios; RS-485 como bus multinodo.
#ifndef JWSIM_DEVICES_H
#define JWSIM_DEVICES_H

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "jwsim/engine.h"

namespace jwsim {

// ------------------------------------------------------------------ señales
// Red digital con varios manejadores. Cada manejador se identifica por un
// puntero (su dueño). Resolución: sin manejadores activos la red toma su
// nivel de reposo (pull de la placa); con manejadores, AND cableado (un nivel
// bajo gana) y se marca contención si hay niveles distintos.
class Net {
 public:
  explicit Net(std::string name, bool idle_level = true) : name_(std::move(name)), idle_(idle_level) {}

  const std::string &name() const { return name_; }
  bool level() const { return level_; }
  bool driven() const { return !drivers_.empty(); }
  bool contention() const { return contention_; }

  void drive(const void *owner, bool level) {
    for (auto &d : drivers_) {
      if (d.owner == owner) {
        d.level = level;
        resolve();
        return;
      }
    }
    drivers_.push_back({owner, level});
    resolve();
  }
  void release(const void *owner) {
    for (size_t i = 0; i < drivers_.size(); ++i) {
      if (drivers_[i].owner == owner) {
        drivers_.erase(drivers_.begin() + static_cast<long>(i));
        break;
      }
    }
    resolve();
  }
  // Atajos para un único manejador anónimo (estímulos externos).
  void drive(bool level) { drive(nullptr, level); }
  void release() { release(nullptr); }

  void set_idle(bool level) {
    idle_ = level;
    resolve();
  }

  using Listener = std::function<void(Net &, bool level)>;
  void on_change(Listener cb) { listeners_.push_back(std::move(cb)); }

 private:
  struct Driver {
    const void *owner;
    bool level;
  };
  void resolve() {
    bool lvl = idle_;
    contention_ = false;
    if (!drivers_.empty()) {
      lvl = true;
      for (auto &d : drivers_) lvl = lvl && d.level;
      for (auto &d : drivers_) contention_ = contention_ || (d.level != lvl);
    }
    if (lvl == level_) return;
    level_ = lvl;
    for (auto &cb : listeners_) cb(*this, level_);
  }

  std::string name_;
  bool idle_;
  bool level_ = idle_;
  bool contention_ = false;
  std::vector<Driver> drivers_;
  std::vector<Listener> listeners_;
};

// ------------------------------------------------------------------ I2C
class I2CTarget {
 public:
  virtual ~I2CTarget() = default;
  // START (o START repetido) dirigido a este dispositivo. Devuelve ACK.
  virtual bool i2c_start(bool read) = 0;
  // Byte escrito por el maestro. Devuelve ACK.
  virtual bool i2c_write(uint8_t byte) = 0;
  // Byte leído por el maestro; `ack` indica si el maestro hará ACK.
  virtual uint8_t i2c_read(bool ack) = 0;
  virtual void i2c_stop() = 0;
};

enum class I2CResult { Ok, AddressNack, DataNack };

class I2CBus {
 public:
  explicit I2CBus(std::string name) : name_(std::move(name)) {}
  void attach(uint8_t address, I2CTarget *target);
  const std::string &name() const { return name_; }

  // Transacción completa del maestro: [START addr+W, wbuf...] [Sr addr+R, rbuf...] STOP.
  // Registra la transacción en la traza y devuelve su duración a freq_hz.
  I2CResult transfer(uint8_t address, const uint8_t *wbuf, size_t wlen, uint8_t *rbuf, size_t rlen,
                     size_t *rx_count, uint32_t freq_hz, jwsim_ns_t *duration_ns);

  // Observadores (analizador de buses, G3).
  using Observer = std::function<void(const I2CBus &, uint8_t addr, const uint8_t *w, size_t wl,
                                      const uint8_t *r, size_t rl, I2CResult)>;
  void observe(Observer cb) { observers_.push_back(std::move(cb)); }

  uint64_t transactions = 0;
  uint64_t nacks = 0;
  jwsim_ns_t busy_ns = 0;

 private:
  std::string name_;
  std::vector<std::pair<uint8_t, I2CTarget *>> targets_;
  std::vector<Observer> observers_;
};

// ------------------------------------------------------------------ SPI
class SPITarget {
 public:
  virtual ~SPITarget() = default;
  virtual void spi_select(bool selected) = 0;
  virtual uint8_t spi_transfer(uint8_t mosi) = 0;
};

class SPIBus {
 public:
  explicit SPIBus(std::string name) : name_(std::move(name)) {}
  // El dispositivo queda seleccionado mientras su CS (activo en bajo) esté en 0.
  void attach(Net &cs, SPITarget *target);
  // Transfiere un byte con todos los dispositivos seleccionados. Sin
  // dispositivo seleccionado, MISO queda en reposo (0xFF).
  uint8_t transfer(uint8_t mosi);
  const std::string &name() const { return name_; }

  uint64_t bytes = 0;            // bytes transferidos
  uint64_t unselected_bytes = 0; // bytes sin ningún dispositivo seleccionado

 private:
  std::string name_;
  std::vector<std::pair<Net *, SPITarget *>> targets_;
};

// ------------------------------------------------------------------ placa
// Registro global de la placa virtual activa (una por proceso de simulación).
struct Board {
  virtual ~Board() = default;
  virtual const char *name() const = 0;
  virtual I2CBus *i2c_bus(int port) = 0;            // por número de controlador
  virtual SPIBus *spi_bus(int host) = 0;            // SPI2=HSPI, SPI3=VSPI
  virtual Net *signal(const std::string &name) = 0; // señales de bornera (I0_0, Q0_0...)
  // Bytes transmitidos por la UART `port` del ESP32 (consola, RS-485...).
  virtual void uart_tx(int port, const uint8_t *data, size_t len) = 0;
  virtual std::vector<std::string> signal_names() const = 0;
};

Board &board();
void set_board(Board *b);

// Red de cada GPIO nativo del ESP32 (0..39). La posee el HAL; la placa
// conecta a ella sus modelos (CS de SPI, EN_IO, INT del W5500, LEDs...).
Net &gpio(int pin);

// Inyecta bytes en la recepción de la UART `port` (lo provee el HAL).
void uart_inject(int port, const uint8_t *data, size_t len);

} // namespace jwsim

#endif // JWSIM_DEVICES_H
