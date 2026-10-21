// SPI maestro del ESP32 simulado: reemplaza esp32-hal-spi.c.
//
// Las transferencias se entregan byte a byte al bus de la placa
// (jwsim::SPIBus); los dispositivos se seleccionan por su CS (GPIO). El tiempo
// virtual avanza 8 bits / frecuencia por byte. spi_t conserva como primer
// miembro el puntero `volatile spi_dev_t *dev`, del que depende la librería SPI
// del package (lecturas FIFO-reuse del W5500): ese bloque de registros es el
// modelo de soc/spi_struct.h.
#include <cstdint>
#include <cstring>

#include "esp32-hal-spi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "jwsim/devices.h"
#include "jwsim/engine.h"
#include "soc/spi_struct.h"

namespace {
constexpr uint32_t APB_HZ = 80000000;
constexpr int NUM_HOSTS = 4;   // 0=SPI (flash), 1=FSPI, 2=HSPI, 3=VSPI
} // namespace

struct spi_struct_t {
  volatile spi_dev_t *dev;      // debe ser el primer miembro (ver SPI.cpp del package)
  SemaphoreHandle_t lock;
  uint8_t num;
  int8_t sck;
  int8_t miso;
  int8_t mosi;
  int8_t ss;
  bool ss_invert;
  uint32_t clock_div;
  uint8_t data_mode;
  uint8_t bit_order;
};

namespace {

spi_dev_t g_regs[NUM_HOSTS];
spi_struct_t g_spi[NUM_HOSTS];

uint32_t div_to_freq(uint32_t div) {
  if (div & (1u << 31)) return APB_HZ;
  const uint32_t pre = ((div >> 18) & 0x1FFF) + 1;
  const uint32_t n = ((div >> 12) & 0x3F) + 1;
  return APB_HZ / (pre * n);
}

uint32_t freq_to_div(uint32_t freq) {
  if (freq >= APB_HZ) return 1u << 31;
  uint32_t best = 0, best_freq = 0;
  for (uint32_t n = 2; n <= 64; ++n) {
    uint32_t pre = APB_HZ / (freq * n);
    if (pre < 1) pre = 1;
    while (pre <= 8192 && APB_HZ / (pre * n) > freq) ++pre;
    if (pre > 8192) continue;
    const uint32_t f = APB_HZ / (pre * n);
    if (f > best_freq) {
      best_freq = f;
      const uint32_t h = (n / 2) - 1;
      best = ((pre - 1) << 18) | ((n - 1) << 12) | (h << 6) | (n - 1);
    }
  }
  return best;
}

uint8_t reverse8(uint8_t x) {
  x = static_cast<uint8_t>((x & 0xF0) >> 4 | (x & 0x0F) << 4);
  x = static_cast<uint8_t>((x & 0xCC) >> 2 | (x & 0x33) << 2);
  return static_cast<uint8_t>((x & 0xAA) >> 1 | (x & 0x55) << 1);
}

uint8_t xfer(spi_t *spi, uint8_t out) {
  const bool lsb = spi->bit_order == SPI_LSBFIRST;
  jwsim::SPIBus *bus = jwsim::board().spi_bus(spi->num);
  uint8_t in = bus ? bus->transfer(lsb ? reverse8(out) : out) : 0xFF;
  if (lsb) in = reverse8(in);
  uint8_t rec[3] = {'S', out, in};
  jwsim_trace_bytes(rec, sizeof(rec));
  return in;
}

void charge(spi_t *spi, size_t bytes) {
  const uint64_t f = div_to_freq(spi->clock_div);
  jwsim_cpu(jwsim_costs()->hal_call + bytes * 8ULL * 1000000000ULL / (f ? f : 1000000));
}

void xfer_buf(spi_t *spi, const uint8_t *in, uint8_t *out, size_t len) {
  for (size_t i = 0; i < len; ++i) {
    const uint8_t r = xfer(spi, in ? in[i] : 0xFF);
    if (out) out[i] = r;
  }
  charge(spi, len);
}

// Big-endian en el cable para MSBFIRST (equivalente al swap del HAL original).
uint32_t xfer_word(spi_t *spi, uint32_t data, int bytes) {
  uint32_t res = 0;
  for (int i = bytes - 1; i >= 0; --i) {
    res = (res << 8) | xfer(spi, static_cast<uint8_t>(data >> (8 * i)));
  }
  charge(spi, bytes);
  return res;
}

spi_t *host_of_reg(const volatile void *reg, size_t *offset) {
  const auto *p = reinterpret_cast<const volatile uint8_t *>(reg);
  for (int i = 0; i < NUM_HOSTS; ++i) {
    const auto *base = reinterpret_cast<const volatile uint8_t *>(&g_regs[i]);
    if (p >= base && p < base + sizeof(spi_dev_t)) {
      *offset = static_cast<size_t>(p - base);
      return &g_spi[i];
    }
  }
  jwsim_fatal("acceso a registro SPI fuera del modelo");
}

} // namespace

extern "C" {

// ---------------------------------------------------------- registros GP-SPI
uint32_t jwsim_spi_reg_read(const volatile void *reg) {
  size_t off = 0;
  host_of_reg(reg, &off);
  const auto *r = static_cast<const volatile jwsim_spi_reg32 *>(reg);
  if (off == offsetof(spi_dev_t, cmd)) return 0;   // la transferencia ya terminó
  return r->raw;
}

void jwsim_spi_reg_write(volatile void *reg, uint32_t value) {
  size_t off = 0;
  spi_t *spi = host_of_reg(reg, &off);
  auto *r = static_cast<volatile jwsim_spi_reg32 *>(reg);
  if (off == offsetof(spi_dev_t, cmd)) {
    if (!(value & 1u)) return;
    // cmd.usr = 1: transferencia full-duplex de mosi_dlen+1 bits desde/hacia data_buf.
    volatile spi_dev_t *dev = spi->dev;
    const uint32_t bits = dev->mosi_dlen.usr_mosi_dbitlen.raw + 1;
    const size_t len = bits / 8 > 64 ? 64 : bits / 8;
    uint8_t buf[64];
    for (size_t i = 0; i < 16; ++i) {
      const uint32_t w = dev->data_buf[i].raw;
      std::memcpy(&buf[i * 4], &w, 4);
    }
    for (size_t i = 0; i < len; ++i) buf[i] = xfer(spi, buf[i]);
    for (size_t i = 0; i < 16; ++i) {
      uint32_t w;
      std::memcpy(&w, &buf[i * 4], 4);
      dev->data_buf[i].raw = w;
    }
    charge(spi, len);
    return;
  }
  r->raw = value;
}

// ---------------------------------------------------------- bus
spi_t *spiStartBus(uint8_t num, uint32_t clockDiv, uint8_t dataMode, uint8_t bitOrder) {
  if (num >= NUM_HOSTS) return nullptr;
  spi_t *spi = &g_spi[num];
  if (!spi->lock) spi->lock = xSemaphoreCreateMutex();
  spi->dev = &g_regs[num];
  spi->num = num;
  spi->sck = spi->miso = spi->mosi = spi->ss = -1;
  spi->clock_div = clockDiv;
  spi->data_mode = dataMode;
  spi->bit_order = bitOrder;
  return spi;
}

void spiStopBus(spi_t *) {}
bool spiAttachSCK(spi_t *spi, int8_t p) { return spi && ((spi->sck = p), true); }
bool spiAttachMISO(spi_t *spi, int8_t p) { return spi && ((spi->miso = p), true); }
bool spiAttachMOSI(spi_t *spi, int8_t p) { return spi && ((spi->mosi = p), true); }
bool spiDetachSCK(spi_t *spi) { return spi && ((spi->sck = -1), true); }
bool spiDetachMISO(spi_t *spi) { return spi && ((spi->miso = -1), true); }
bool spiDetachMOSI(spi_t *spi) { return spi && ((spi->mosi = -1), true); }
bool spiAttachSS(spi_t *spi, uint8_t, int8_t p) { return spi && ((spi->ss = p), true); }
bool spiDetachSS(spi_t *spi) { return spi && ((spi->ss = -1), true); }
void spiEnableSSPins(spi_t *, uint8_t) {}
void spiDisableSSPins(spi_t *, uint8_t) {}
// El SS por hardware no se modela: las librerías del JWPLC manejan CS por GPIO.
void spiSSEnable(spi_t *) {}
void spiSSDisable(spi_t *) {}
void spiSSSet(spi_t *) {}
void spiSSClear(spi_t *) {}
void spiWaitReady(spi_t *) {}
void spiSSInvert(spi_t *spi, bool inv) {
  if (spi) spi->ss_invert = inv;
}
uint32_t spiGetClockDiv(spi_t *spi) { return spi ? spi->clock_div : 0; }
uint8_t spiGetDataMode(spi_t *spi) { return spi ? spi->data_mode : 0; }
uint8_t spiGetBitOrder(spi_t *spi) { return spi ? spi->bit_order : 0; }
void spiSetClockDiv(spi_t *spi, uint32_t d) {
  if (spi) spi->clock_div = d;
}
void spiSetDataMode(spi_t *spi, uint8_t m) {
  if (spi) spi->data_mode = m;
}
void spiSetBitOrder(spi_t *spi, uint8_t o) {
  if (spi) spi->bit_order = o;
}

void spiTransaction(spi_t *spi, uint32_t clockDiv, uint8_t dataMode, uint8_t bitOrder) {
  if (!spi) return;
  xSemaphoreTake(spi->lock, portMAX_DELAY);
  spi->clock_div = clockDiv;
  spi->data_mode = dataMode;
  spi->bit_order = bitOrder;
}
void spiSimpleTransaction(spi_t *spi) {
  if (spi) xSemaphoreTake(spi->lock, portMAX_DELAY);
}
void spiEndTransaction(spi_t *spi) {
  if (spi) xSemaphoreGive(spi->lock);
}

// Variantes con bloqueo (sin sufijo NL) y sin bloqueo comparten la lógica.
void spiWrite(spi_t *spi, const uint32_t *data, uint8_t len) {
  xfer_buf(spi, reinterpret_cast<const uint8_t *>(data), nullptr, static_cast<size_t>(len) * 4);
}
void spiTransfer(spi_t *spi, uint32_t *out, uint8_t len) {
  xfer_buf(spi, reinterpret_cast<uint8_t *>(out), reinterpret_cast<uint8_t *>(out), static_cast<size_t>(len) * 4);
}
void spiWriteByte(spi_t *spi, uint8_t d) { xfer_word(spi, d, 1); }
void spiWriteWord(spi_t *spi, uint16_t d) { xfer_word(spi, d, 2); }
void spiWriteLong(spi_t *spi, uint32_t d) { xfer_word(spi, d, 4); }
uint8_t spiTransferByte(spi_t *spi, uint8_t d) { return static_cast<uint8_t>(xfer_word(spi, d, 1)); }
uint16_t spiTransferWord(spi_t *spi, uint16_t d) { return static_cast<uint16_t>(xfer_word(spi, d, 2)); }
uint32_t spiTransferLong(spi_t *spi, uint32_t d) { return xfer_word(spi, d, 4); }
void spiTransferBytes(spi_t *spi, const uint8_t *data, uint8_t *out, uint32_t size) { xfer_buf(spi, data, out, size); }
void spiTransferBits(spi_t *spi, uint32_t data, uint32_t *out, uint8_t bits) {
  const uint32_t r = xfer_word(spi, data, (bits + 7) / 8);
  if (out) *out = r;
}

void spiWriteNL(spi_t *spi, const void *data, uint32_t len) {
  xfer_buf(spi, static_cast<const uint8_t *>(data), nullptr, len);
}
void spiWriteByteNL(spi_t *spi, uint8_t d) { xfer_word(spi, d, 1); }
void spiWriteShortNL(spi_t *spi, uint16_t d) { xfer_word(spi, d, 2); }
void spiWriteLongNL(spi_t *spi, uint32_t d) { xfer_word(spi, d, 4); }
void spiWritePixelsNL(spi_t *spi, const void *data, uint32_t len) {
  // Píxeles RGB565 en memoria little-endian: se envían MSB primero.
  const auto *p = static_cast<const uint8_t *>(data);
  for (uint32_t i = 0; i + 1 < len; i += 2) {
    xfer(spi, p[i + 1]);
    xfer(spi, p[i]);
  }
  charge(spi, len);
}
uint8_t spiTransferByteNL(spi_t *spi, uint8_t d) { return static_cast<uint8_t>(xfer_word(spi, d, 1)); }
uint16_t spiTransferShortNL(spi_t *spi, uint16_t d) { return static_cast<uint16_t>(xfer_word(spi, d, 2)); }
uint32_t spiTransferLongNL(spi_t *spi, uint32_t d) { return xfer_word(spi, d, 4); }
void spiTransferBytesNL(spi_t *spi, const void *in, uint8_t *out, uint32_t len) {
  xfer_buf(spi, static_cast<const uint8_t *>(in), out, len);
}
void spiTransferBitsNL(spi_t *spi, uint32_t data, uint32_t *out, uint8_t bits) { spiTransferBits(spi, data, out, bits); }

uint32_t spiFrequencyToClockDiv(spi_t *, uint32_t freq) { return freq_to_div(freq ? freq : 1); }
uint32_t spiClockDivToFrequency(spi_t *, uint32_t clockDiv) { return div_to_freq(clockDiv); }

} // extern "C"
