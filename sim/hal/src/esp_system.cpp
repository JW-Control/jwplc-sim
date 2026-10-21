// Servicios de sistema de ESP-IDF sobre el motor: tiempo, aleatorios
// deterministas, log, reinicio, heap y stubs de periféricos internos.
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "esp_cpu.h"
#include "esp_err.h"
#include "esp_idf_version.h"
#include "esp_log.h"
#include "esp_netif_ip_addr.h"
#include "esp_partition.h"
#include "esp_random.h"
#include "esp_sleep.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "jwsim/devices.h"
#include "jwsim/engine.h"
#include "lwip/netif.h"
#include "rom/ets_sys.h"
#include "soc/rtc.h"

namespace {
// xorshift64*: semilla fija por defecto; el runner puede cambiarla.
uint64_t g_rng = 0x4A57504C4353494DULL;   // "JWPLCSIM"

void console_vprintf(const char *fmt, va_list ap) {
  char buf[512];
  const int n = std::vsnprintf(buf, sizeof(buf), fmt, ap);
  if (n > 0) {
    const size_t len = static_cast<size_t>(n) < sizeof(buf) ? static_cast<size_t>(n) : sizeof(buf) - 1;
    jwsim::board().uart_tx(0, reinterpret_cast<const uint8_t *>(buf), len);
  }
}
} // namespace

extern "C" {

void jwsim_seed_random(uint64_t seed) { g_rng = seed ? seed : 1; }

int64_t esp_timer_get_time(void) { return static_cast<int64_t>(jwsim_now() / JWSIM_NS_PER_US); }

esp_err_t esp_timer_create(const esp_timer_create_args_t *args, esp_timer_handle_t *) {
  jwsim_fatal("esp_timer_create('%s'): esp_timer no soportado todavía por JWPLC Sim", args && args->name ? args->name : "");
}
esp_err_t esp_timer_start_once(esp_timer_handle_t, uint64_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t esp_timer_start_periodic(esp_timer_handle_t, uint64_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t esp_timer_stop(esp_timer_handle_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t esp_timer_delete(esp_timer_handle_t) { return ESP_ERR_NOT_SUPPORTED; }
bool esp_timer_is_active(esp_timer_handle_t) { return false; }

uint32_t esp_random(void) {
  g_rng ^= g_rng >> 12;
  g_rng ^= g_rng << 25;
  g_rng ^= g_rng >> 27;
  return static_cast<uint32_t>((g_rng * 0x2545F4914F6CDD1DULL) >> 32);
}

void esp_fill_random(void *buf, size_t len) {
  auto *p = static_cast<uint8_t *>(buf);
  for (size_t i = 0; i < len; ++i) p[i] = static_cast<uint8_t>(esp_random());
}

void esp_restart(void) {
  std::fflush(stdout);
  jwsim_fatal("esp_restart() solicitado por el firmware (reinicio no soportado todavía)");
}
void esp_system_abort(const char *details) { jwsim_fatal("esp_system_abort: %s", details ? details : ""); }
esp_reset_reason_t esp_reset_reason(void) { return ESP_RST_POWERON; }
// Heap del ESP32 sin PSRAM: valores representativos y constantes (deterministas).
uint32_t esp_get_free_heap_size(void) { return 200000; }
uint32_t esp_get_free_internal_heap_size(void) { return 200000; }
uint32_t esp_get_minimum_free_heap_size(void) { return 180000; }
esp_err_t esp_register_shutdown_handler(shutdown_handler_t) { return ESP_OK; }

esp_err_t esp_sleep_enable_timer_wakeup(uint64_t) { return ESP_ERR_NOT_SUPPORTED; }
void esp_deep_sleep_start(void) { jwsim_fatal("deep sleep no soportado por JWPLC Sim"); }
esp_err_t esp_light_sleep_start(void) { return ESP_ERR_NOT_SUPPORTED; }
void esp_deep_sleep(uint64_t) { jwsim_fatal("deep sleep no soportado por JWPLC Sim"); }
esp_sleep_wakeup_cause_t esp_sleep_get_wakeup_cause(void) { return ESP_SLEEP_WAKEUP_UNDEFINED; }

esp_cpu_cycle_count_t esp_cpu_get_cycle_count(void) {
  return static_cast<esp_cpu_cycle_count_t>(jwsim_now() * 240ULL / 1000ULL);
}
int esp_cpu_get_core_id(void) { return jwsim_current_core(); }

// Watchdog de tareas: el watchdog del simulador opera en tiempo real (G1).
esp_err_t esp_task_wdt_init(const esp_task_wdt_config_t *) { return ESP_OK; }
esp_err_t esp_task_wdt_reconfigure(const esp_task_wdt_config_t *) { return ESP_OK; }
esp_err_t esp_task_wdt_deinit(void) { return ESP_OK; }
esp_err_t esp_task_wdt_add(TaskHandle_t) { return ESP_OK; }
esp_err_t esp_task_wdt_delete(TaskHandle_t) { return ESP_OK; }
esp_err_t esp_task_wdt_reset(void) { return ESP_OK; }
esp_err_t esp_task_wdt_status(TaskHandle_t) { return ESP_OK; }

void rtc_clk_xtal_freq_update(rtc_xtal_freq_t) {}
void rtc_clk_cpu_freq_set_xtal(void) {}
uint32_t rtc_clk_apb_freq_get(void) { return 80000000; }

const char *esp_get_idf_version(void) { return "v5.5.1-jwsim"; }

const char *esp_err_to_name(esp_err_t code) {
  switch (code) {
    case ESP_OK: return "ESP_OK";
    case ESP_FAIL: return "ESP_FAIL";
    case ESP_ERR_NO_MEM: return "ESP_ERR_NO_MEM";
    case ESP_ERR_INVALID_ARG: return "ESP_ERR_INVALID_ARG";
    case ESP_ERR_INVALID_STATE: return "ESP_ERR_INVALID_STATE";
    case ESP_ERR_NOT_FOUND: return "ESP_ERR_NOT_FOUND";
    case ESP_ERR_NOT_SUPPORTED: return "ESP_ERR_NOT_SUPPORTED";
    case ESP_ERR_TIMEOUT: return "ESP_ERR_TIMEOUT";
    default: return "ESP_ERR_UNKNOWN";
  }
}

void _esp_error_check_failed(esp_err_t rc, const char *file, int line, const char *, const char *expr) {
  jwsim_fatal("ESP_ERROR_CHECK falló: %s = %s (%s:%d)", expr, esp_err_to_name(rc), file, line);
}

// ------------------------------------------------------------------ log
void esp_log_writev(esp_log_level_t, const char *, const char *fmt, va_list ap) { console_vprintf(fmt, ap); }
void esp_log_write(esp_log_level_t level, const char *tag, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  esp_log_writev(level, tag, fmt, ap);
  va_end(ap);
}
void esp_log_level_set(const char *, esp_log_level_t) {}
uint32_t esp_log_timestamp(void) { return static_cast<uint32_t>(jwsim_now() / JWSIM_NS_PER_MS); }

int ets_printf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  console_vprintf(fmt, ap);
  va_end(ap);
  return 0;
}
void ets_delay_us(uint32_t us) { jwsim_cpu(static_cast<jwsim_ns_t>(us) * JWSIM_NS_PER_US); }

int log_printf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  console_vprintf(fmt, ap);
  va_end(ap);
  return 0;
}

void log_print_buf(const uint8_t *b, size_t len) {
  for (size_t i = 0; i < len; ++i) log_printf("%02x%s", b[i], (i % 16 == 15) ? "\n" : " ");
  log_printf("\n");
}

// ------------------------------------------------------------------ red
struct netif *netif_list = nullptr;
esp_ip6_addr_type_t esp_netif_ip6_get_addr_type(esp_ip6_addr_t *) { return ESP_IP6_ADDR_IS_UNKNOWN; }

// ------------------------------------------------------------------ flash
const esp_partition_t *esp_partition_find_first(esp_partition_type_t, esp_partition_subtype_t, const char *) {
  return nullptr;
}
esp_err_t esp_partition_read(const esp_partition_t *, size_t, void *, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t esp_partition_write(const esp_partition_t *, size_t, const void *, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t esp_partition_erase_range(const esp_partition_t *, size_t, size_t) { return ESP_ERR_NOT_SUPPORTED; }

} // extern "C"

// MAC base del ESP32 simulado (efuse). Fija por defecto; configurable por
// proyecto .jwsim en G1 para simular varios PLC en la misma red.
extern "C" void jwsim_get_mac(uint8_t mac[6]) {
  static const uint8_t kMac[6] = {0x24, 0x0A, 0xC4, 0x4A, 0x57, 0x01};
  for (int i = 0; i < 6; ++i) mac[i] = kMac[i];
}
