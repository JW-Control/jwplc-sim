// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo del W5500. Referencia: WIZnet W5500 Datasheet v1.1.0. Cada
// comportamiento está en MODEL.md con su sección y su test.
#include "jwsim/models/w5500.h"

#include <algorithm>
#include <cstring>

namespace jwsim::models {

namespace {

constexpr uint8_t kVersion = 0x04;
// PHYCFGR: RST = 1 (en marcha), OPMD = 0 (configuración por pines),
// OPMDC = 111 (todas las capacidades, autonegociación).
constexpr uint8_t kPhyCfgDefault = 0xB8;
constexpr uint8_t kPhyStatusUp = 0x07;    // DPX completo, SPD 100, LNK
constexpr uint32_t kBroadcast = 0xFFFFFFFFu;

uint16_t be16(const uint8_t *p) { return static_cast<uint16_t>(p[0] << 8 | p[1]); }
void put16(uint8_t *p, uint16_t v) {
  p[0] = static_cast<uint8_t>(v >> 8);
  p[1] = static_cast<uint8_t>(v);
}

} // namespace

W5500::W5500() { power_on_reset(); }

void W5500::power_on_reset() {
  soft_reset();
  common_[PHYCFGR] = kPhyCfgDefault;
  link_at_ = jwsim_now() + kAutoNegTime;
}

// MR.RST: valores de reset de todos los registros comunes y de socket
// (§3.1, §3.2). El PHY no se reinicia.
void W5500::soft_reset() {
  const uint8_t phy = common_[PHYCFGR];
  common_.fill(0);
  put16(&common_[RTR], 0x07D0);
  common_[RCR] = 0x08;
  common_[PTIMER] = 0x28;
  put16(&common_[PMRU], 0xFFFF);
  common_[PHYCFGR] = phy ? phy : kPhyCfgDefault;
  common_[VERSIONR] = kVersion;
  ir_ = 0;
  for (int s = 0; s < kSockets; ++s) {
    if (net_ && sock_[s].sr != SOCK_CLOSED) {
      if (sock_[s].sr == SOCK_UDP) net_->udp_close(s);
      else net_->tcp_close(s, false);
    }
    sock_reset(s);
  }
  update_int();
}

void W5500::sock_reset(int s) {
  Sock &k = sock_[s];
  const uint32_t epoch = k.epoch + 1;
  k = Sock{};
  k.epoch = epoch;
  std::fill(k.reg.begin() + Sn_DHAR, k.reg.begin() + Sn_DHAR + 6, 0xFF);
  k.reg[Sn_TTL] = 0x80;
  k.reg[Sn_RXBUF_SIZE] = 2;
  k.reg[Sn_TXBUF_SIZE] = 2;
  k.reg[Sn_IMR] = 0xFF;
  put16(&k.reg[Sn_FRAG], 0x4000);
}

void W5500::set_int_net(Net *n) {
  int_net_ = n;
  update_int();
}

void W5500::set_cable(bool connected) {
  if (connected && !cable_) link_at_ = jwsim_now() + kAutoNegTime;
  cable_ = connected;
}

bool W5500::link_up() const {
  return cable_ && !in_reset_ && (common_[PHYCFGR] & 0x80) && jwsim_now() >= link_at_;
}

void W5500::set_reset_pin(bool level) {
  if (!level) {
    in_reset_ = true;
    return;
  }
  if (!in_reset_) return;
  in_reset_ = false;
  common_[PHYCFGR] = 0;
  power_on_reset();
}

// ------------------------------------------------------------------ tamaños
size_t W5500::tx_size(int s) const { return static_cast<size_t>(sock_[s].reg[Sn_TXBUF_SIZE]) * 1024; }
size_t W5500::rx_size(int s) const { return static_cast<size_t>(sock_[s].reg[Sn_RXBUF_SIZE]) * 1024; }
size_t W5500::tx_base(int s) const {
  size_t b = 0;
  for (int i = 0; i < s; ++i) b += tx_size(i);
  return b;
}
size_t W5500::rx_base(int s) const {
  size_t b = 0;
  for (int i = 0; i < s; ++i) b += rx_size(i);
  return b;
}
uint16_t W5500::tx_fsr(int s) const {
  const Sock &k = sock_[s];
  const uint16_t used = static_cast<uint16_t>(k.tx_wr - k.tx_rd);
  return used >= tx_size(s) ? 0 : static_cast<uint16_t>(tx_size(s) - used);
}
uint16_t W5500::rx_rsr(int s) const { return static_cast<uint16_t>(sock_[s].rx_wr - sock_[s].rx_rd); }
uint16_t W5500::port(int s) const { return be16(&sock_[s].reg[Sn_PORT]); }
uint32_t W5500::dip(int s) const {
  const uint8_t *p = &sock_[s].reg[Sn_DIPR];
  return static_cast<uint32_t>(p[0]) << 24 | static_cast<uint32_t>(p[1]) << 16 | static_cast<uint32_t>(p[2]) << 8 | p[3];
}
uint16_t W5500::dport(int s) const { return be16(&sock_[s].reg[Sn_DPORT]); }

// ------------------------------------------------------------------ registros
uint8_t W5500::common(uint16_t addr) const {
  if (addr >= common_.size()) return 0;
  switch (addr) {
    case IR: return ir_;
    case SIR: {
      uint8_t sir = 0;
      for (int s = 0; s < kSockets; ++s)
        if (sock_[s].ir & sock_[s].reg[Sn_IMR]) sir |= static_cast<uint8_t>(1u << s);
      return sir;
    }
    case PHYCFGR: return static_cast<uint8_t>((common_[PHYCFGR] & 0xF8) | (link_up() ? kPhyStatusUp : 0));
    default: return common_[addr];
  }
}

uint8_t W5500::sreg(int s, uint16_t addr) const {
  if (addr >= 0x30) return 0;
  const Sock &k = sock_[s];
  uint8_t v16[2];
  switch (addr) {
    case Sn_CR: return 0;   // el comando se acepta al escribirlo
    case Sn_IR: return k.ir;
    case Sn_SR: return k.sr;
    case Sn_TX_FSR: case Sn_TX_FSR + 1: put16(v16, tx_fsr(s)); return v16[addr - Sn_TX_FSR];
    case Sn_TX_RD: case Sn_TX_RD + 1: put16(v16, k.tx_rd); return v16[addr - Sn_TX_RD];
    case Sn_TX_WR: case Sn_TX_WR + 1: put16(v16, k.tx_wr); return v16[addr - Sn_TX_WR];
    case Sn_RX_RSR: case Sn_RX_RSR + 1: put16(v16, rx_rsr(s)); return v16[addr - Sn_RX_RSR];
    case Sn_RX_WR: case Sn_RX_WR + 1: put16(v16, k.rx_wr); return v16[addr - Sn_RX_WR];
    default: return k.reg[addr];
  }
}

uint8_t W5500::reg_read(uint8_t bsb, uint16_t addr) {
  if (bsb == 0) return common(addr);
  const int s = bsb >> 2;
  switch (bsb & 3) {
    case 1: return sreg(s, addr);
    case 2: {
      const size_t n = tx_size(s);
      return n ? txmem_[(tx_base(s) + (addr & (n - 1))) % kBufTotal] : 0;
    }
    case 3: {
      const size_t n = rx_size(s);
      return n ? rxmem_[(rx_base(s) + (addr & (n - 1))) % kBufTotal] : 0;
    }
    default: return 0;   // bloques reservados
  }
}

void W5500::reg_write(uint8_t bsb, uint16_t addr, uint8_t v) {
  if (bsb == 0) {
    if (addr >= common_.size()) return;
    switch (addr) {
      case MR:
        if (v & 0x80) soft_reset();
        else common_[MR] = v;
        return;
      case IR:
        ir_ &= static_cast<uint8_t>(~v);
        update_int();
        return;
      case SIR: case VERSIONR: return;   // solo lectura
      case PHYCFGR: {
        const bool was_running = common_[PHYCFGR] & 0x80;
        common_[PHYCFGR] = static_cast<uint8_t>(v & 0xF8);
        // RST en 0 reinicia el PHY; al volver a 1 renegocia.
        if ((v & 0x80) && !was_running) link_at_ = jwsim_now() + kAutoNegTime;
        return;
      }
      case IMR: case SIMR:
        common_[addr] = v;
        update_int();
        return;
      default: common_[addr] = v; return;
    }
  }
  const int s = bsb >> 2;
  Sock &k = sock_[s];
  switch (bsb & 3) {
    case 1:
      if (addr >= 0x30) return;
      switch (addr) {
        case Sn_CR: command(s, v); return;
        case Sn_IR:
          k.ir &= static_cast<uint8_t>(~v);
          update_int();
          return;
        case Sn_SR: case Sn_TX_FSR: case Sn_TX_FSR + 1: case Sn_TX_RD: case Sn_TX_RD + 1:
        case Sn_RX_RSR: case Sn_RX_RSR + 1: case Sn_RX_WR: case Sn_RX_WR + 1:
          return;   // solo lectura
        case Sn_RXBUF_SIZE: case Sn_TXBUF_SIZE:
          // 0, 1, 2, 4, 8 o 16 KiB; otro valor se ignora.
          if (v == 0 || v == 1 || v == 2 || v == 4 || v == 8 || v == 16) k.reg[addr] = v;
          return;
        case Sn_IMR:
          k.reg[addr] = v;
          update_int();
          return;
        default: k.reg[addr] = v; return;
      }
    case 2: {
      const size_t n = tx_size(s);
      if (n) txmem_[(tx_base(s) + (addr & (n - 1))) % kBufTotal] = v;
      return;
    }
    case 3: {
      const size_t n = rx_size(s);
      if (n) rxmem_[(rx_base(s) + (addr & (n - 1))) % kBufTotal] = v;
      return;
    }
    default: return;
  }
}

// ------------------------------------------------------------------ tiempo
void W5500::after(jwsim_ns_t delay, std::function<void()> fn) {
  const jwsim_ns_t at = jwsim_now() + delay;
  if (sched_) sched_(at, std::move(fn));
  else pending_.emplace_back(at, std::move(fn));
}

void W5500::flush_pending() {
  const jwsim_ns_t now = jwsim_now();
  std::stable_sort(pending_.begin(), pending_.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
  while (!pending_.empty() && pending_.front().first <= now) {
    auto fn = std::move(pending_.front().second);
    pending_.erase(pending_.begin());
    fn();
  }
}

// Plazo de TCP del §4.2 (RTR): Σ_{N=0..M} RTR·2^N + (RCR − M)·RTRmax, con
// M el menor valor tal que RTR·2^(M+1) > 65535 (y M ≤ RCR).
static jwsim_ns_t tcp_timeout(uint16_t rtr, uint8_t rcr) {
  if (rtr == 0) rtr = 1;
  int m = 0;
  while (m < rcr && static_cast<uint32_t>(rtr) << (m + 1) <= 65535) ++m;
  uint64_t units = 0;
  for (int n = 0; n <= m; ++n) units += static_cast<uint64_t>(rtr) << n;
  units += static_cast<uint64_t>(rcr - m) * (static_cast<uint64_t>(rtr) << m);
  return static_cast<jwsim_ns_t>(units) * 100 * JWSIM_NS_PER_US;
}

// ARP: RTR · (RCR + 1).
static jwsim_ns_t arp_timeout(uint16_t rtr, uint8_t rcr) {
  return static_cast<jwsim_ns_t>(rtr) * (rcr + 1u) * 100 * JWSIM_NS_PER_US;
}

// ------------------------------------------------------------------ comandos
void W5500::set_ir(int s, uint8_t bits) {
  sock_[s].ir |= bits;
  update_int();
}

void W5500::update_int() {
  if (!int_net_) return;
  const bool pending = (ir_ & common_[IMR]) || (common(SIR) & common_[SIMR]);
  int_net_->drive(this, !pending);
}

void W5500::command(int s, uint8_t cmd) {
  Sock &k = sock_[s];
  const uint8_t proto = k.reg[Sn_MR] & 0x0F;
  const uint16_t rtr = be16(&common_[RTR]);
  const uint8_t rcr = common_[RCR];
  switch (cmd) {
    case CMD_OPEN: {
      if (k.sr != SOCK_CLOSED && net_) {
        if (k.sr == SOCK_UDP) net_->udp_close(s);
        else net_->tcp_close(s, false);
      }
      ++k.epoch;
      k.tx_rd = k.tx_wr = k.rx_rd = k.rx_wr = 0;
      put16(&k.reg[Sn_TX_WR], 0);
      put16(&k.reg[Sn_RX_RD], 0);
      k.rx_queue.clear();
      k.sending = false;
      if (proto == 1) {
        k.sr = SOCK_INIT;
      } else if (proto == 2) {
        k.sr = SOCK_UDP;
        if (net_) net_->udp_open(s, port(s));
      } else if (proto == 4 && s == 0) {
        k.sr = SOCK_MACRAW;
      } else {
        k.sr = SOCK_CLOSED;
      }
      return;
    }
    case CMD_LISTEN:
      if (k.sr != SOCK_INIT) return;
      k.sr = SOCK_LISTEN;
      if (net_) net_->tcp_listen(s, port(s));
      return;
    case CMD_CONNECT: {
      if (k.sr != SOCK_INIT) return;
      k.sr = SOCK_SYNSENT;
      const uint32_t epoch = k.epoch;
      // Sin red, nadie responde al ARP; con red, el par responde o vence el
      // plazo de retransmisión de TCP.
      const jwsim_ns_t limit = net_ ? tcp_timeout(rtr, rcr) : arp_timeout(rtr, rcr);
      after(limit, [this, s, epoch] {
        if (sock_[s].epoch == epoch && sock_[s].sr == SOCK_SYNSENT) {
          if (net_) net_->tcp_close(s, false);
          sock_[s].sr = SOCK_CLOSED;
          set_ir(s, IR_TIMEOUT);
        }
      });
      if (net_) net_->tcp_connect(s, port(s), dip(s), dport(s));
      return;
    }
    case CMD_DISCON: {
      const uint32_t epoch = ++k.epoch;
      if (k.sr == SOCK_ESTABLISHED || k.sr == SOCK_CLOSE_WAIT) {
        if (net_) net_->tcp_close(s, true);
        // FIN y su ACK (y el FIN del par) en el tiempo de dos tramas.
        k.sr = k.sr == SOCK_ESTABLISHED ? SOCK_FIN_WAIT : SOCK_LAST_ACK;
        after(2 * kFrameOverhead, [this, s, epoch] {
          if (sock_[s].epoch != epoch) return;
          sock_[s].sr = SOCK_CLOSED;
          set_ir(s, IR_DISCON);
        });
      } else if (k.sr == SOCK_LISTEN || k.sr == SOCK_SYNSENT || k.sr == SOCK_INIT) {
        if (net_ && k.sr != SOCK_INIT) net_->tcp_close(s, false);
        k.sr = SOCK_CLOSED;
      }
      return;
    }
    case CMD_CLOSE:
      if (net_ && k.sr != SOCK_CLOSED) {
        if (k.sr == SOCK_UDP) net_->udp_close(s);
        else if (k.sr != SOCK_INIT && k.sr != SOCK_MACRAW) net_->tcp_close(s, false);
      }
      ++k.epoch;
      k.sr = SOCK_CLOSED;
      k.rx_queue.clear();
      k.sending = false;
      return;
    case CMD_SEND: {
      const bool tcp = k.sr == SOCK_ESTABLISHED || k.sr == SOCK_CLOSE_WAIT;
      if (!tcp && k.sr != SOCK_UDP) return;
      const uint16_t wr = be16(&k.reg[Sn_TX_WR]);
      const uint16_t len = static_cast<uint16_t>(wr - k.tx_rd);
      k.tx_wr = wr;
      const size_t n = tx_size(s);
      std::vector<uint8_t> data(n ? std::min<size_t>(len, n) : 0);
      for (size_t i = 0; i < data.size(); ++i)
        data[i] = txmem_[(tx_base(s) + ((k.tx_rd + i) & (n - 1))) % kBufTotal];
      const uint32_t epoch = k.epoch;
      k.sending = true;
      k.tx_sending_to = wr;
      if (!tcp) {
        const uint32_t ip = dip(s);
        const bool broadcast = ip == kBroadcast;
        if (!net_ && !broadcast) {
          // Sin red no hay respuesta al ARP del destino.
          after(arp_timeout(rtr, rcr), [this, s, epoch] {
            if (sock_[s].epoch != epoch) return;
            sock_[s].sending = false;
            set_ir(s, IR_TIMEOUT);
          });
          return;
        }
        if (net_) net_->udp_send(s, ip, dport(s), data.data(), data.size());
      } else if (net_) {
        net_->tcp_send(s, data.data(), data.size());
      }
      after(kFrameOverhead + static_cast<jwsim_ns_t>(data.size()) * kWireNsPerByte, [this, s, epoch] {
        if (sock_[s].epoch != epoch) return;
        sock_[s].tx_rd = sock_[s].tx_sending_to;
        sock_[s].sending = false;
        set_ir(s, IR_SEND_OK);
      });
      return;
    }
    case CMD_RECV:
      if (k.sr == SOCK_CLOSED || k.sr == SOCK_INIT || k.sr == SOCK_LISTEN) return;
      k.rx_rd = be16(&k.reg[Sn_RX_RD]);
      pump_rx(s);
      return;
    case CMD_SEND_MAC: case CMD_SEND_KEEP:
    default:
      return;
  }
}

// Lo recibido por TCP entra al búfer según el lugar libre (la ventana de
// TCP retiene el resto en el par).
void W5500::pump_rx(int s) {
  Sock &k = sock_[s];
  const size_t n = rx_size(s);
  if (!n || k.rx_queue.empty()) return;
  const size_t room = n - rx_rsr(s);
  const size_t take = std::min(room, k.rx_queue.size());
  for (size_t i = 0; i < take; ++i) {
    rxmem_[(rx_base(s) + ((k.rx_wr + i) & (n - 1))) % kBufTotal] = k.rx_queue.front();
    k.rx_queue.pop_front();
  }
  if (take) {
    k.rx_wr = static_cast<uint16_t>(k.rx_wr + take);
    set_ir(s, IR_RECV);
  }
}

// ------------------------------------------------------------------ red
void W5500::net_connected(int s, uint32_t ip, uint16_t peer_port) {
  Sock &k = sock_[s];
  if (k.sr != SOCK_SYNSENT && k.sr != SOCK_LISTEN) return;
  if (k.sr == SOCK_LISTEN) {
    k.reg[Sn_DIPR] = static_cast<uint8_t>(ip >> 24);
    k.reg[Sn_DIPR + 1] = static_cast<uint8_t>(ip >> 16);
    k.reg[Sn_DIPR + 2] = static_cast<uint8_t>(ip >> 8);
    k.reg[Sn_DIPR + 3] = static_cast<uint8_t>(ip);
    put16(&k.reg[Sn_DPORT], peer_port);
  }
  // MAC del par resuelta por ARP: una dirección administrada localmente
  // derivada de su IP (02:00:IP).
  const uint8_t mac[6] = {0x02, 0x00, k.reg[Sn_DIPR], k.reg[Sn_DIPR + 1], k.reg[Sn_DIPR + 2], k.reg[Sn_DIPR + 3]};
  std::memcpy(&k.reg[Sn_DHAR], mac, 6);
  ++k.epoch;   // anula el plazo del CONNECT
  k.sr = SOCK_ESTABLISHED;
  set_ir(s, IR_CON);
}

void W5500::net_timeout(int s) {
  Sock &k = sock_[s];
  if (k.sr != SOCK_SYNSENT) return;
  ++k.epoch;
  k.sr = SOCK_CLOSED;
  set_ir(s, IR_TIMEOUT);
}

void W5500::net_data(int s, const uint8_t *data, size_t len) {
  Sock &k = sock_[s];
  if (k.sr != SOCK_ESTABLISHED && k.sr != SOCK_FIN_WAIT) return;
  k.rx_queue.insert(k.rx_queue.end(), data, data + len);
  pump_rx(s);
}

void W5500::net_peer_closed(int s) {
  Sock &k = sock_[s];
  if (k.sr == SOCK_ESTABLISHED) {
    k.sr = SOCK_CLOSE_WAIT;
    set_ir(s, IR_DISCON);
  } else if (k.sr == SOCK_FIN_WAIT) {
    ++k.epoch;
    k.sr = SOCK_CLOSED;
    set_ir(s, IR_DISCON);
  }
}

void W5500::net_reset(int s) {
  Sock &k = sock_[s];
  if (k.sr == SOCK_CLOSED || k.sr == SOCK_UDP || k.sr == SOCK_MACRAW || k.sr == SOCK_INIT || k.sr == SOCK_LISTEN) return;
  const bool connecting = k.sr == SOCK_SYNSENT;
  ++k.epoch;
  k.sr = SOCK_CLOSED;
  k.rx_queue.clear();
  set_ir(s, connecting ? IR_TIMEOUT : IR_DISCON);
}

// Datagrama UDP: cabecera de 8 bytes (IP, puerto, largo) y los datos (§5.2.2);
// si no cabe entero se descarta.
void W5500::net_udp(int s, uint32_t ip, uint16_t from_port, const uint8_t *data, size_t len) {
  Sock &k = sock_[s];
  if (k.sr != SOCK_UDP) return;
  const size_t n = rx_size(s);
  if (!n || 8 + len > n - rx_rsr(s)) return;
  uint8_t hdr[8] = {static_cast<uint8_t>(ip >> 24), static_cast<uint8_t>(ip >> 16), static_cast<uint8_t>(ip >> 8),
                    static_cast<uint8_t>(ip), 0, 0, 0, 0};
  put16(hdr + 4, from_port);
  put16(hdr + 6, static_cast<uint16_t>(len));
  size_t at = k.rx_wr;
  for (uint8_t b : hdr) rxmem_[(rx_base(s) + (at++ & (n - 1))) % kBufTotal] = b;
  for (size_t i = 0; i < len; ++i) rxmem_[(rx_base(s) + (at++ & (n - 1))) % kBufTotal] = data[i];
  k.rx_wr = static_cast<uint16_t>(k.rx_wr + 8 + len);
  set_ir(s, IR_RECV);
}

// ------------------------------------------------------------------ SPI
// Trama (§2.2): dirección de 16 bits, byte de control (BSB[4:0] RWB OM[1:0])
// y datos. OM = 00: largo variable hasta subir SCSn; 01/10/11: 1, 2 o 4
// bytes y luego otra trama sin soltar SCSn. La dirección se incrementa en
// cada byte.
void W5500::spi_select(bool selected) {
  selected_ = selected && !in_reset_;
  phase_ = 0;
  fdm_left_ = 0;
  if (selected_ && !sched_) flush_pending();
}

uint8_t W5500::spi_transfer(uint8_t mosi) {
  if (!selected_) return 0xFF;
  switch (phase_) {
    case 0:
      addr_ = static_cast<uint16_t>(mosi << 8);
      phase_ = 1;
      return 0x00;
    case 1:
      addr_ |= mosi;
      phase_ = 2;
      return 0x00;
    case 2: {
      ctrl_ = mosi;
      static constexpr int kFdm[4] = {0, 1, 2, 4};
      fdm_left_ = kFdm[ctrl_ & 3];
      phase_ = 3;
      return 0x00;
    }
    default: {
      const uint8_t bsb = ctrl_ >> 3;
      uint8_t miso = 0x00;
      if (ctrl_ & 0x04) reg_write(bsb, addr_, mosi);
      else miso = reg_read(bsb, addr_);
      addr_ = static_cast<uint16_t>(addr_ + 1);
      if (fdm_left_ && --fdm_left_ == 0) phase_ = 0;
      return miso;
    }
  }
}

} // namespace jwsim::models
