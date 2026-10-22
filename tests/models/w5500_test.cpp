// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del modelo W5500, sin firmware: una prueba por fila de
// sim/models/w5500/MODEL.md (gate JWSIM_G4_W5500_MODEL). El "host" arma las
// tramas SPI como utility/w5100.cpp de JWPLC_Ethernet y una red de prueba
// registra lo que el chip envía.
#include <cstring>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/engine.h"
#include "jwsim/models/w5500.h"
#include "test_util.h"

using jwsim::Net;
using jwsim::SPIBus;
using jwsim::models::W5500;

namespace {

void advance_us(uint64_t us) {
  jwsim_run_limits lim{jwsim_now() + us * JWSIM_NS_PER_US};
  jwsim_run(&lim);
}
void advance_ms(uint64_t ms) { advance_us(ms * 1000); }

struct FakeNet : W5500::Network {
  std::vector<std::string> log;
  std::vector<std::vector<uint8_t>> sent;
  void tcp_listen(int s, uint16_t port) override { log.push_back("listen " + std::to_string(s) + " " + std::to_string(port)); }
  void tcp_connect(int s, uint16_t lp, uint32_t ip, uint16_t port) override {
    log.push_back("connect " + std::to_string(s) + " " + std::to_string(lp) + " " + std::to_string(ip >> 24) + "." +
                  std::to_string((ip >> 16) & 255) + "." + std::to_string((ip >> 8) & 255) + "." + std::to_string(ip & 255) +
                  ":" + std::to_string(port));
  }
  void tcp_send(int s, const uint8_t *d, size_t n) override {
    log.push_back("send " + std::to_string(s) + " " + std::to_string(n));
    sent.emplace_back(d, d + n);
  }
  void tcp_close(int s, bool fin) override { log.push_back(std::string(fin ? "fin " : "rst ") + std::to_string(s)); }
  void udp_open(int s, uint16_t port) override { log.push_back("udp " + std::to_string(s) + " " + std::to_string(port)); }
  void udp_send(int s, uint32_t ip, uint16_t port, const uint8_t *d, size_t n) override {
    log.push_back("sendto " + std::to_string(s) + " " + std::to_string(ip & 255) + ":" + std::to_string(port) + " " + std::to_string(n));
    sent.emplace_back(d, d + n);
  }
  void udp_close(int s) override { log.push_back("udpclose " + std::to_string(s)); }
  bool has(const std::string &l) const {
    for (auto &x : log)
      if (x == l) return true;
    return false;
  }
};

struct Host {
  SPIBus bus{"VSPI"};
  Net cs{"CS", true};
  Net intn{"INTn", true};
  W5500 chip;
  FakeNet net;
  // Los eventos agendados por un Host ya destruido (test anterior) se descartan.
  std::shared_ptr<bool> alive = std::make_shared<bool>(true);
  ~Host() { *alive = false; }
  explicit Host(bool with_net = true) {
    bus.attach(cs, &chip);
    chip.set_int_net(&intn);
    chip.set_scheduler([a = alive](jwsim_ns_t at, std::function<void()> fn) {
      auto *f = new std::function<void()>([a, fn = std::move(fn)] {
        if (*a) fn();
      });
      jwsim_schedule_event(at, [](void *a, jwsim_ns_t) {
        auto *g = static_cast<std::function<void()> *>(a);
        (*g)();
        delete g;
      }, f);
    });
    if (with_net) chip.set_network(&net);
  }
  // Trama de largo variable (OM = 00).
  void write(uint8_t bsb, uint16_t addr, const std::vector<uint8_t> &data) {
    cs.drive(false);
    bus.transfer(static_cast<uint8_t>(addr >> 8));
    bus.transfer(static_cast<uint8_t>(addr));
    bus.transfer(static_cast<uint8_t>(bsb << 3 | 0x04));
    for (uint8_t b : data) bus.transfer(b);
    cs.drive(true);
  }
  std::vector<uint8_t> read(uint8_t bsb, uint16_t addr, size_t n) {
    std::vector<uint8_t> out;
    cs.drive(false);
    bus.transfer(static_cast<uint8_t>(addr >> 8));
    bus.transfer(static_cast<uint8_t>(addr));
    bus.transfer(static_cast<uint8_t>(bsb << 3));
    for (size_t i = 0; i < n; ++i) out.push_back(bus.transfer(0));
    cs.drive(true);
    return out;
  }
  uint8_t r8(uint8_t bsb, uint16_t a) { return read(bsb, a, 1)[0]; }
  uint16_t r16(uint8_t bsb, uint16_t a) {
    auto v = read(bsb, a, 2);
    return static_cast<uint16_t>(v[0] << 8 | v[1]);
  }
  void w8(uint8_t bsb, uint16_t a, uint8_t v) { write(bsb, a, {v}); }
  void w16(uint8_t bsb, uint16_t a, uint16_t v) { write(bsb, a, {static_cast<uint8_t>(v >> 8), static_cast<uint8_t>(v)}); }
  // Socket s: bloques de registros, TX y RX.
  static uint8_t sr(int s) { return static_cast<uint8_t>(s << 2 | 1); }
  static uint8_t tx(int s) { return static_cast<uint8_t>(s << 2 | 2); }
  static uint8_t rx(int s) { return static_cast<uint8_t>(s << 2 | 3); }
  void cmd(int s, uint8_t c) { w8(sr(s), W5500::Sn_CR, c); }
  void open(int s, uint8_t proto, uint16_t port) {
    w8(sr(s), W5500::Sn_MR, proto);
    w16(sr(s), W5500::Sn_PORT, port);
    cmd(s, W5500::CMD_OPEN);
  }
  // Envía como EthernetClient::write: datos en TX_WR, TX_WR += n, SEND.
  void send(int s, const std::string &text) {
    const uint16_t ptr = r16(sr(s), W5500::Sn_TX_WR);
    write(tx(s), ptr, std::vector<uint8_t>(text.begin(), text.end()));
    w16(sr(s), W5500::Sn_TX_WR, static_cast<uint16_t>(ptr + text.size()));
    cmd(s, W5500::CMD_SEND);
  }
  // Lee como EthernetClient::read: RX_RD, datos, RX_RD += n, RECV.
  std::string recv(int s, size_t n) {
    const uint16_t ptr = r16(sr(s), W5500::Sn_RX_RD);
    auto v = read(rx(s), ptr, n);
    w16(sr(s), W5500::Sn_RX_RD, static_cast<uint16_t>(ptr + n));
    cmd(s, W5500::CMD_RECV);
    return std::string(v.begin(), v.end());
  }
  void connect_tcp(int s, uint16_t lport, uint32_t ip, uint16_t port) {
    open(s, 0x01, lport);
    write(sr(s), W5500::Sn_DIPR, {static_cast<uint8_t>(ip >> 24), static_cast<uint8_t>(ip >> 16), static_cast<uint8_t>(ip >> 8), static_cast<uint8_t>(ip)});
    w16(sr(s), W5500::Sn_DPORT, port);
    cmd(s, W5500::CMD_CONNECT);
  }
};

constexpr uint32_t ip4(int a, int b, int c, int d) {
  return static_cast<uint32_t>(a) << 24 | static_cast<uint32_t>(b) << 16 | static_cast<uint32_t>(c) << 8 | static_cast<uint32_t>(d);
}

} // namespace

// 1. Trama SPI: dirección, control y datos con autoincremento (VDM).
TEST(trama_largo_variable) {
  Host h;
  h.write(0, W5500::SIPR, {192, 168, 1, 50});
  auto v = h.read(0, W5500::SIPR, 4);
  CHECK(v == (std::vector<uint8_t>{192, 168, 1, 50}));
  CHECK_EQ(h.r8(0, W5500::SIPR + 2), 1);
}

// 2. Tramas de largo fijo (OM = 01/10/11) seguidas sin soltar SCSn.
TEST(trama_largo_fijo) {
  Host h;
  h.cs.drive(false);
  // Escritura de 1 byte en GAR[0] y de 4 bytes en SUBR, en la misma selección.
  for (uint8_t b : {0x00, 0x01, 0x05, 0xC0}) h.bus.transfer(b);                               // OM=01, write
  for (uint8_t b : {0x00, 0x05, 0x07, 255, 255, 255, 0}) h.bus.transfer(b);                   // OM=11, write
  // Lectura de 2 bytes (RTR) con OM = 10.
  for (uint8_t b : {0x00, 0x19, 0x02}) h.bus.transfer(b);
  const uint8_t hi = h.bus.transfer(0), lo = h.bus.transfer(0);
  h.cs.drive(true);
  CHECK_EQ(h.r8(0, W5500::GAR), 0xC0);
  CHECK(h.read(0, W5500::SUBR, 4) == (std::vector<uint8_t>{255, 255, 255, 0}));
  CHECK_EQ(hi << 8 | lo, 0x07D0);
}

// 3. Valores de reset (§3.1, §3.2) y VERSIONR = 04h de solo lectura.
TEST(valores_de_reset) {
  Host h;
  CHECK_EQ(h.r8(0, W5500::VERSIONR), 0x04);
  h.w8(0, W5500::VERSIONR, 0x99);
  CHECK_EQ(h.r8(0, W5500::VERSIONR), 0x04);
  CHECK_EQ(h.r16(0, W5500::RTR), 0x07D0);
  CHECK_EQ(h.r8(0, W5500::RCR), 0x08);
  CHECK_EQ(h.r8(0, W5500::PTIMER), 0x28);
  CHECK_EQ(h.r16(0, W5500::PMRU), 0xFFFF);
  for (int s = 0; s < 8; ++s) {
    CHECK_EQ(h.r8(Host::sr(s), W5500::Sn_SR), W5500::SOCK_CLOSED);
    CHECK_EQ(h.r8(Host::sr(s), W5500::Sn_TTL), 0x80);
    CHECK_EQ(h.r8(Host::sr(s), W5500::Sn_RXBUF_SIZE), 2);
    CHECK_EQ(h.r8(Host::sr(s), W5500::Sn_TXBUF_SIZE), 2);
    CHECK_EQ(h.r16(Host::sr(s), W5500::Sn_TX_FSR), 0x0800);
    CHECK_EQ(h.r8(Host::sr(s), W5500::Sn_IMR), 0xFF);
    CHECK_EQ(h.r16(Host::sr(s), W5500::Sn_FRAG), 0x4000);
    CHECK_EQ(h.r8(Host::sr(s), W5500::Sn_DHAR), 0xFF);
  }
}

// 4. MR.RST reinicia los registros y MR vuelve a 0 (softReset de w5100.cpp);
//    la detección de chips de la librería identifica un W5500.
TEST(reset_por_software_y_deteccion) {
  Host h;
  h.write(0, W5500::SHAR, {0x24, 0x0A, 0xC4, 1, 2, 3});
  h.w8(Host::sr(3), W5500::Sn_TTL, 7);
  h.w8(0, W5500::MR, 0x80);
  CHECK_EQ(h.r8(0, W5500::MR), 0x00);
  CHECK_EQ(h.r8(0, W5500::SHAR), 0x00);
  CHECK_EQ(h.r8(Host::sr(3), W5500::Sn_TTL), 0x80);
  // isW5200(): tramas de W5200 [addr, addr, 0x80|len, len, dato]: para el
  // W5500 son lecturas de un bloque reservado; MR no cambia y la lectura
  // de MR en formato W5200 devuelve 0, distinto de 0x08.
  auto w5200 = [&](uint16_t a, bool wr, uint8_t v) {
    h.cs.drive(false);
    h.bus.transfer(static_cast<uint8_t>(a >> 8));
    h.bus.transfer(static_cast<uint8_t>(a));
    h.bus.transfer(wr ? 0x80 : 0x00);
    h.bus.transfer(0x01);
    const uint8_t r = h.bus.transfer(v);
    h.cs.drive(true);
    return r;
  };
  w5200(0x0000, true, 0x08);
  CHECK(w5200(0x0000, false, 0) != 0x08);
  // isW5500(): MR acepta 08h, 10h y 00h y VERSIONR = 4.
  for (uint8_t v : {0x08, 0x10, 0x00}) {
    h.w8(0, W5500::MR, v);
    CHECK_EQ(h.r8(0, W5500::MR), v);
  }
}

// 5. Bloques reservados: la escritura se ignora y la lectura da 0.
TEST(bloques_reservados) {
  Host h;
  h.w8(0x04, 0x0000, 0x55);
  CHECK_EQ(h.r8(0x04, 0x0000), 0x00);
  CHECK_EQ(h.r8(0, W5500::MR), 0x00);
}

// 6. PHY: enlace tras la autonegociación; PHYCFGR.RST lo reinicia; sin cable no hay enlace.
TEST(phy_enlace) {
  Host h;
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 0);
  advance_ms(1500);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR), 0xBF);
  h.w8(0, W5500::PHYCFGR, 0x38);   // RST = 0
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 0);
  h.w8(0, W5500::PHYCFGR, 0xB8);
  advance_ms(1000);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 0);
  advance_ms(600);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 1);
  h.chip.set_cable(false);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR), 0xB8);
  h.chip.set_cable(true);
  advance_ms(1500);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 1);
}

// 7. Búferes: tamaño por socket (0/1/2/4/8/16 KiB), región física
//    contigua y dirección relativa que da la vuelta en el tamaño.
TEST(buferes_y_tamanos) {
  Host h;
  h.w8(Host::sr(0), W5500::Sn_TXBUF_SIZE, 3);   // inválido: se ignora
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_TXBUF_SIZE), 2);
  h.w8(Host::sr(0), W5500::Sn_TXBUF_SIZE, 4);
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_TX_FSR), 4096);
  h.write(Host::tx(0), 0x0FFE, {1, 2, 3, 4});    // 0FFE, 0FFF, 0000, 0001
  CHECK(h.read(Host::tx(0), 0x0000, 2) == (std::vector<uint8_t>{3, 4}));
  CHECK(h.read(Host::tx(0), 0x1000, 2) == (std::vector<uint8_t>{3, 4}));
  // El socket 1 empieza después de los 4 KiB del socket 0: no se pisan.
  h.write(Host::tx(1), 0x0000, {9});
  CHECK_EQ(h.r8(Host::tx(0), 0x0000), 3);
  CHECK_EQ(h.r8(Host::tx(1), 0x0800), 9);
}

// 8. Cliente TCP: OPEN → INIT, CONNECT → SYNSENT → ESTABLISHED (CON).
TEST(tcp_cliente_conecta) {
  Host h;
  h.connect_tcp(0, 49152, ip4(192, 168, 1, 10), 502);
  CHECK_EQ(h.chip.status(0), W5500::SOCK_SYNSENT);
  CHECK(h.net.has("connect 0 49152 192.168.1.10:502"));
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_CR), 0);
  h.chip.net_connected(0, ip4(192, 168, 1, 10), 502);
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_SR), W5500::SOCK_ESTABLISHED);
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_IR), W5500::IR_CON);
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_DHAR), 0x02);
}

// 9. SEND: los bytes entre TX_RD y TX_WR salen a la red; FSR baja y vuelve;
//    SEND_OK al terminar la transmisión a 100 Mbit/s.
TEST(tcp_envio) {
  Host h;
  h.connect_tcp(1, 50000, ip4(10, 0, 0, 2), 80);
  h.chip.net_connected(1, ip4(10, 0, 0, 2), 80);
  h.w8(Host::sr(1), W5500::Sn_IR, 0xFF);
  h.send(1, "GET / HTTP/1.0\r\n\r\n");
  CHECK(h.net.has("send 1 18"));
  CHECK(std::string(h.net.sent.back().begin(), h.net.sent.back().end()) == "GET / HTTP/1.0\r\n\r\n");
  CHECK_EQ(h.r16(Host::sr(1), W5500::Sn_TX_FSR), 2048 - 18);
  CHECK_EQ(h.r8(Host::sr(1), W5500::Sn_IR) & W5500::IR_SEND_OK, 0);
  advance_us(10);
  CHECK_EQ(h.r8(Host::sr(1), W5500::Sn_IR) & W5500::IR_SEND_OK, W5500::IR_SEND_OK);
  CHECK_EQ(h.r16(Host::sr(1), W5500::Sn_TX_FSR), 2048);
  CHECK_EQ(h.r16(Host::sr(1), W5500::Sn_TX_RD), 18);
  // Datos que dan la vuelta al final del búfer.
  h.w8(Host::sr(1), W5500::Sn_IR, 0xFF);
  const std::string big(2040, 'x');
  h.send(1, big);
  advance_us(200);
  h.send(1, "0123456789ABCDEF");
  advance_us(50);
  CHECK(std::string(h.net.sent.back().begin(), h.net.sent.back().end()) == "0123456789ABCDEF");
}

// 9b. Sn_TX_WR escrito toma efecto con SEND: hasta entonces se lee el valor
//     anterior. EthernetUDP escribe un datagrama en partes con un
//     desplazamiento acumulado sobre ese valor (socket.cpp, write_data).
TEST(tx_wr_toma_efecto_con_send) {
  Host h;
  h.open(0, 0x02, 5000);
  h.write(Host::sr(0), W5500::Sn_DIPR, {192, 168, 250, 1});
  h.w16(Host::sr(0), W5500::Sn_DPORT, 7);
  uint16_t offset = 0;
  for (const std::string part : {"hola ", "desde ", "el PLC"}) {
    const uint16_t ptr = static_cast<uint16_t>(h.r16(Host::sr(0), W5500::Sn_TX_WR) + offset);
    h.write(Host::tx(0), ptr, std::vector<uint8_t>(part.begin(), part.end()));
    h.w16(Host::sr(0), W5500::Sn_TX_WR, static_cast<uint16_t>(ptr + part.size()));
    offset = static_cast<uint16_t>(offset + part.size());
  }
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_TX_WR), 0);
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_TX_FSR), 2048);
  h.cmd(0, W5500::CMD_SEND);
  CHECK(std::string(h.net.sent.back().begin(), h.net.sent.back().end()) == "hola desde el PLC");
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_TX_WR), 17);
}

// 10. Plazos: sin red el ARP vence en RTR·(RCR+1) = 1,8 s; con red y sin
//     respuesta del par, el plazo de TCP es 31,8 s (valores por defecto).
TEST(plazos_de_conexion) {
  {
    Host h(false);
    h.connect_tcp(0, 1000, ip4(192, 168, 1, 99), 502);
    advance_ms(1799);
    CHECK_EQ(h.chip.status(0), W5500::SOCK_SYNSENT);
    advance_ms(2);
    CHECK_EQ(h.chip.status(0), W5500::SOCK_CLOSED);
    CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_IR), W5500::IR_TIMEOUT);
  }
  {
    Host h;
    h.connect_tcp(0, 1000, ip4(192, 168, 1, 99), 502);
    advance_ms(31799);
    CHECK_EQ(h.chip.status(0), W5500::SOCK_SYNSENT);
    advance_ms(2);
    CHECK_EQ(h.chip.status(0), W5500::SOCK_CLOSED);
    CHECK(h.net.has("rst 0"));
  }
  {
    Host h;
    h.connect_tcp(0, 1000, ip4(192, 168, 1, 99), 502);
    h.chip.net_timeout(0);   // rechazo del par
    CHECK_EQ(h.chip.status(0), W5500::SOCK_CLOSED);
    CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_IR), W5500::IR_TIMEOUT);
  }
}

// 11. Servidor TCP: LISTEN y conexión entrante con IP y puerto del par.
TEST(tcp_servidor) {
  Host h;
  h.open(2, 0x01, 502);
  h.cmd(2, W5500::CMD_LISTEN);
  CHECK_EQ(h.chip.status(2), W5500::SOCK_LISTEN);
  CHECK(h.net.has("listen 2 502"));
  h.chip.net_connected(2, ip4(192, 168, 1, 7), 51000);
  CHECK_EQ(h.chip.status(2), W5500::SOCK_ESTABLISHED);
  CHECK(h.read(Host::sr(2), W5500::Sn_DIPR, 4) == (std::vector<uint8_t>{192, 168, 1, 7}));
  CHECK_EQ(h.r16(Host::sr(2), W5500::Sn_DPORT), 51000);
}

// 12. Recepción TCP: RSR, RECV, RX_RD que da la vuelta; lo que no cabe
//     espera (ventana) y entra al liberar lugar con RECV.
TEST(tcp_recepcion) {
  Host h;
  h.open(0, 0x01, 502);
  h.cmd(0, W5500::CMD_LISTEN);
  h.chip.net_connected(0, ip4(192, 168, 1, 7), 51000);
  h.w8(Host::sr(0), W5500::Sn_IR, 0xFF);
  const std::string a(1500, 'a'), b(1000, 'b');
  h.chip.net_data(0, reinterpret_cast<const uint8_t *>(a.data()), a.size());
  h.chip.net_data(0, reinterpret_cast<const uint8_t *>(b.data()), b.size());
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_RX_RSR), 2048);
  CHECK_EQ(h.chip.rx_pending(0), 452u);
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_IR), W5500::IR_RECV);
  CHECK(h.recv(0, 1500) == a);
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_RX_RSR), 1000);
  CHECK(h.recv(0, 1000) == b);   // da la vuelta al final de los 2 KiB
  CHECK_EQ(h.r16(Host::sr(0), W5500::Sn_RX_RSR), 0);
}

// 13. UDP: OPEN, SENDTO a DIPR:DPORT y recepción con cabecera de 8 bytes;
//     un datagrama que no cabe se descarta.
TEST(udp) {
  Host h;
  h.open(3, 0x02, 68);
  CHECK_EQ(h.chip.status(3), W5500::SOCK_UDP);
  CHECK(h.net.has("udp 3 68"));
  h.write(Host::sr(3), W5500::Sn_DIPR, {255, 255, 255, 255});
  h.w16(Host::sr(3), W5500::Sn_DPORT, 67);
  h.send(3, "DHCPDISCOVER");
  CHECK(h.net.has("sendto 3 255:67 12"));
  const uint8_t payload[] = {1, 2, 3, 4, 5};
  h.chip.net_udp(3, ip4(192, 168, 1, 1), 67, payload, sizeof payload);
  CHECK_EQ(h.r16(Host::sr(3), W5500::Sn_RX_RSR), 13);
  CHECK(h.read(Host::rx(3), 0, 13) == (std::vector<uint8_t>{192, 168, 1, 1, 0, 67, 0, 5, 1, 2, 3, 4, 5}));
  const std::vector<uint8_t> big(2048, 7);
  h.chip.net_udp(3, ip4(192, 168, 1, 1), 67, big.data(), big.size());
  CHECK_EQ(h.r16(Host::sr(3), W5500::Sn_RX_RSR), 13);
  // Sin red, un SENDTO a otra IP espera el ARP y vence (TIMEOUT); a la
  // difusión no hace falta ARP (SEND_OK).
  Host n(false);
  n.open(0, 0x02, 5000);
  n.write(Host::sr(0), W5500::Sn_DIPR, {192, 168, 1, 77});
  n.w16(Host::sr(0), W5500::Sn_DPORT, 5000);
  n.send(0, "x");
  advance_ms(1801);
  CHECK_EQ(n.r8(Host::sr(0), W5500::Sn_IR), W5500::IR_TIMEOUT);
}

// 14. Cierre: DISCON (FIN) → CLOSED con DISCON; FIN del par → CLOSE_WAIT;
//     CLOSE inmediato.
TEST(tcp_cierre) {
  Host h;
  h.connect_tcp(0, 1000, ip4(10, 0, 0, 2), 80);
  h.chip.net_connected(0, ip4(10, 0, 0, 2), 80);
  h.cmd(0, W5500::CMD_DISCON);
  CHECK_EQ(h.chip.status(0), W5500::SOCK_FIN_WAIT);
  CHECK(h.net.has("fin 0"));
  advance_us(20);
  CHECK_EQ(h.chip.status(0), W5500::SOCK_CLOSED);
  CHECK(h.r8(Host::sr(0), W5500::Sn_IR) & W5500::IR_DISCON);

  h.connect_tcp(1, 1001, ip4(10, 0, 0, 2), 80);
  h.chip.net_connected(1, ip4(10, 0, 0, 2), 80);
  h.chip.net_peer_closed(1);
  CHECK_EQ(h.chip.status(1), W5500::SOCK_CLOSE_WAIT);
  CHECK(h.r8(Host::sr(1), W5500::Sn_IR) & W5500::IR_DISCON);
  h.cmd(1, W5500::CMD_CLOSE);
  CHECK_EQ(h.chip.status(1), W5500::SOCK_CLOSED);
  CHECK(h.net.has("rst 1"));
}

// 15. Interrupciones: Sn_IR se borra escribiendo 1; SIR refleja Sn_IR &
//     Sn_IMR; INTn baja con SIR & SIMR (o IR & IMR).
TEST(interrupciones) {
  Host h;
  h.w8(0, W5500::SIMR, 0x01);
  h.w8(Host::sr(0), W5500::Sn_IMR, W5500::IR_RECV);
  h.open(0, 0x01, 502);
  h.cmd(0, W5500::CMD_LISTEN);
  h.chip.net_connected(0, ip4(192, 168, 1, 7), 51000);
  CHECK_EQ(h.r8(0, W5500::SIR), 0);   // CON enmascarado
  CHECK(h.intn.level());
  const uint8_t d = 'z';
  h.chip.net_data(0, &d, 1);
  CHECK_EQ(h.r8(0, W5500::SIR), 0x01);
  CHECK(!h.intn.level());
  h.w8(Host::sr(0), W5500::Sn_IR, W5500::IR_RECV);
  CHECK_EQ(h.r8(Host::sr(0), W5500::Sn_IR), W5500::IR_CON);
  CHECK(h.intn.level());
}

// 16. RSTn: con el pin en bajo el chip no responde; al subir, valores de
//     reset y nueva autonegociación.
TEST(pin_de_reset) {
  Host h;
  advance_ms(1600);
  h.w8(0, W5500::GAR, 0x12);
  h.chip.set_reset_pin(false);
  CHECK_EQ(h.r8(0, W5500::VERSIONR), 0xFF);   // MISO en reposo
  h.chip.set_reset_pin(true);
  CHECK_EQ(h.r8(0, W5500::GAR), 0x00);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 0);
  advance_ms(1500);
  CHECK_EQ(h.r8(0, W5500::PHYCFGR) & 0x01, 1);
}

int main() { return run_all_tests("W5500"); }
