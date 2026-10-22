// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Controlador Ethernet W5500 (WIZnet) por registros: bloque común, 8 sockets
// con sus búferes de 16 KiB de TX y de RX, comandos, interrupciones (INTn)
// y PHY. La red queda detrás de un puerto (W5500::Network): el modelo no
// abre sockets del host. Ver sim/models/w5500/MODEL.md.
#ifndef JWSIM_MODELS_W5500_H
#define JWSIM_MODELS_W5500_H

#include <array>
#include <cstdint>
#include <deque>
#include <functional>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/engine.h"

namespace jwsim::models {

class W5500 : public SPITarget {
 public:
  static constexpr int kSockets = 8;
  static constexpr size_t kBufTotal = 16 * 1024;

  // Registros comunes (BSB 00000).
  enum Common : uint16_t {
    MR = 0x0000, GAR = 0x0001, SUBR = 0x0005, SHAR = 0x0009, SIPR = 0x000F, INTLEVEL = 0x0013, IR = 0x0015,
    IMR = 0x0016, SIR = 0x0017, SIMR = 0x0018, RTR = 0x0019, RCR = 0x001B, PTIMER = 0x001C, PMAGIC = 0x001D,
    PHAR = 0x001E, PSID = 0x0024, PMRU = 0x0026, UIPR = 0x0028, UPORTR = 0x002C, PHYCFGR = 0x002E,
    VERSIONR = 0x0039,
  };
  // Registros de cada socket (BSB n·4 + 1).
  enum Socket : uint16_t {
    Sn_MR = 0x00, Sn_CR = 0x01, Sn_IR = 0x02, Sn_SR = 0x03, Sn_PORT = 0x04, Sn_DHAR = 0x06, Sn_DIPR = 0x0C,
    Sn_DPORT = 0x10, Sn_MSSR = 0x12, Sn_TOS = 0x15, Sn_TTL = 0x16, Sn_RXBUF_SIZE = 0x1E, Sn_TXBUF_SIZE = 0x1F,
    Sn_TX_FSR = 0x20, Sn_TX_RD = 0x22, Sn_TX_WR = 0x24, Sn_RX_RSR = 0x26, Sn_RX_RD = 0x28, Sn_RX_WR = 0x2A,
    Sn_IMR = 0x2C, Sn_FRAG = 0x2D, Sn_KPALVTR = 0x2F,
  };
  enum Command : uint8_t {
    CMD_OPEN = 0x01, CMD_LISTEN = 0x02, CMD_CONNECT = 0x04, CMD_DISCON = 0x08, CMD_CLOSE = 0x10,
    CMD_SEND = 0x20, CMD_SEND_MAC = 0x21, CMD_SEND_KEEP = 0x22, CMD_RECV = 0x40,
  };
  enum Status : uint8_t {
    SOCK_CLOSED = 0x00, SOCK_INIT = 0x13, SOCK_LISTEN = 0x14, SOCK_SYNSENT = 0x15, SOCK_SYNRECV = 0x16,
    SOCK_ESTABLISHED = 0x17, SOCK_FIN_WAIT = 0x18, SOCK_CLOSING = 0x1A, SOCK_TIME_WAIT = 0x1B,
    SOCK_CLOSE_WAIT = 0x1C, SOCK_LAST_ACK = 0x1D, SOCK_UDP = 0x22, SOCK_MACRAW = 0x42,
  };
  enum SnIr : uint8_t { IR_CON = 0x01, IR_DISCON = 0x02, IR_RECV = 0x04, IR_TIMEOUT = 0x08, IR_SEND_OK = 0x10 };

  // Tiempos del modelo (MODEL.md §Tiempos).
  static constexpr jwsim_ns_t kAutoNegTime = 1500 * JWSIM_NS_PER_MS;   // PHY: hasta el enlace
  static constexpr jwsim_ns_t kWireNsPerByte = 80;                      // 100 Mbit/s
  static constexpr jwsim_ns_t kFrameOverhead = 5 * JWSIM_NS_PER_US;    // cabeceras + IFG + proceso

  // Red: lo que el chip hace hacia afuera. Cada llamada ocurre en el
  // instante virtual actual; las respuestas llegan por los métodos net_*.
  struct Network {
    virtual ~Network() = default;
    virtual void tcp_listen(int s, uint16_t port) = 0;
    virtual void tcp_connect(int s, uint16_t local_port, uint32_t ip, uint16_t port) = 0;
    virtual void tcp_send(int s, const uint8_t *data, size_t len) = 0;
    // fin: true = cierre ordenado (DISCON, FIN); false = CLOSE (RST o nada).
    virtual void tcp_close(int s, bool fin) = 0;
    virtual void udp_open(int s, uint16_t port) = 0;
    virtual void udp_send(int s, uint32_t ip, uint16_t port, const uint8_t *data, size_t len) = 0;
    virtual void udp_close(int s) = 0;
  };

  W5500();

  void set_network(Network *net) { net_ = net; }
  // Línea INTn (activa en bajo, colector abierto en la placa).
  void set_int_net(Net *n);
  // Agenda de la placa: llama a fn en el instante `at` (SEND_OK, PHY,
  // plazos). Sin agenda, los eventos con tiempo se aplican en el próximo
  // acceso SPI.
  using Scheduler = std::function<void(jwsim_ns_t at, std::function<void()> fn)>;
  void set_scheduler(Scheduler s) { sched_ = std::move(s); }
  // Cable: el enlace sube kAutoNegTime después de conectarlo (o del reset).
  void set_cable(bool connected);
  bool link_up() const;
  // Pin RSTn (activo en bajo).
  void set_reset_pin(bool level);

  // Eventos de la red hacia el chip.
  void net_connected(int s, uint32_t peer_ip, uint16_t peer_port);  // CONNECT aceptado o LISTEN con cliente
  void net_timeout(int s);                                           // CONNECT sin respuesta o rechazado
  void net_data(int s, const uint8_t *data, size_t len);            // TCP
  void net_peer_closed(int s);                                       // FIN del par
  void net_reset(int s);                                             // RST del par
  void net_udp(int s, uint32_t ip, uint16_t port, const uint8_t *data, size_t len);

  // Lectura directa para tests y la tabla de observación.
  uint8_t common(uint16_t addr) const;
  uint8_t sreg(int s, uint16_t addr) const;
  uint8_t status(int s) const { return sock_[s].sr; }
  size_t rx_pending(int s) const { return sock_[s].rx_queue.size(); }

  // SPITarget
  void spi_select(bool selected) override;
  uint8_t spi_transfer(uint8_t mosi) override;

 private:
  struct Sock {
    std::array<uint8_t, 0x30> reg{};
    uint8_t sr = SOCK_CLOSED;
    uint8_t ir = 0;
    // tx_wr: el valor del último SEND (lo escrito en Sn_TX_WR toma efecto
    // con SEND; leerlo devuelve este).
    uint16_t tx_rd = 0, tx_wr = 0, rx_rd = 0, rx_wr = 0;
    uint16_t tx_sending_to = 0;        // TX_RD al terminar el SEND en curso
    bool sending = false;
    std::deque<uint8_t> rx_queue;      // TCP recibido que aún no cabe en el búfer
    uint32_t epoch = 0;                // invalida eventos agendados tras CLOSE/OPEN
  };

  void power_on_reset();
  void soft_reset();
  void sock_reset(int s);
  void reg_write(uint8_t bsb, uint16_t addr, uint8_t v);
  uint8_t reg_read(uint8_t bsb, uint16_t addr);
  void command(int s, uint8_t cmd);
  void set_ir(int s, uint8_t bits);
  void update_int();
  void after(jwsim_ns_t delay, std::function<void()> fn);
  void flush_pending();
  void pump_rx(int s);
  size_t tx_size(int s) const;
  size_t rx_size(int s) const;
  size_t tx_base(int s) const;
  size_t rx_base(int s) const;
  uint16_t tx_fsr(int s) const;
  uint16_t rx_rsr(int s) const;
  uint16_t port(int s) const;
  uint32_t dip(int s) const;
  uint16_t dport(int s) const;

  std::array<uint8_t, 0x40> common_{};
  std::array<Sock, kSockets> sock_{};
  std::array<uint8_t, kBufTotal> txmem_{};
  std::array<uint8_t, kBufTotal> rxmem_{};
  Network *net_ = nullptr;
  Net *int_net_ = nullptr;
  Scheduler sched_;
  std::vector<std::pair<jwsim_ns_t, std::function<void()>>> pending_;  // sin agenda
  bool cable_ = true;
  jwsim_ns_t link_at_ = 0;     // instante en que el enlace sube (cable conectado)
  bool in_reset_ = false;
  uint8_t ir_ = 0;

  // Trama SPI en curso.
  bool selected_ = false;
  int phase_ = 0;              // 0-1 dirección, 2 control, 3+ datos
  uint16_t addr_ = 0;
  uint8_t ctrl_ = 0;
  int fdm_left_ = 0;           // bytes restantes de una trama de largo fijo
};

} // namespace jwsim::models

#endif
