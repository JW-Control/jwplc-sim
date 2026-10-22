// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_HAL_EXTRAS: esp_restart() conserva lo externo al ESP32 y reinicia
// el firmware. Se corre con tests/hal_extras/reinicio.stim:
//   arranque 1  POWERON; guarda una marca en FRAM; I0_2 = 1 por estímulo;
//               "REINICIAR" por consola → manejador de apagado y ESP.restart()
//   arranque 2  SW; millis() desde 0; la marca de FRAM, la NVS y la entrada
//               I0_2 siguen; espera I0_5 (estímulo posterior) y reinicia solo
//   arranque 3  SW; un temporizador de hardware hace de vigilante y llama a
//               esp_restart() desde su ISR (como ESP32/examples/WatchdogTimer)
//   arranque 4  SW; contador de NVS en 4
// Imprime "[PASS]"/"[FAIL]" por caso y "REINICIO arranque N: P PASS, F FAIL".
#include <Preferences.h>

int passed = 0;
int failed = 0;

void check(bool ok, const char *what) {
  Serial.print(ok ? "[PASS] " : "[FAIL] ");
  Serial.println(what);
  (ok ? passed : failed)++;
}

void onShutdown() { Serial.println("manejador de apagado"); }

void ARDUINO_ISR_ATTR watchdog() {
  ets_printf("vigilante: reinicio desde la ISR\n");
  esp_restart();
}

static constexpr uint32_t MARK_ADDR = 0x100;
static constexpr uint32_t MARK = 0x4A57524Bu;   // "JWRK"

void summary(uint32_t boot) {
  Serial.print("REINICIO arranque ");
  Serial.print(boot);
  Serial.print(": ");
  Serial.print(passed);
  Serial.print(" PASS, ");
  Serial.print(failed);
  Serial.println(" FAIL");
}

static uint32_t boot = 0;
static String line;

void setup() {
  const unsigned long t = millis();
  Serial.begin(115200);
  Preferences prefs;
  prefs.begin("reinicio", false);
  boot = prefs.getUInt("n", 0) + 1;
  prefs.putUInt("n", boot);
  prefs.end();
  const esp_reset_reason_t reason = esp_reset_reason();
  Serial.printf("arranque %u razon=%d millis=%lu esp_timer_ms=%lld ticks=%u\n", boot, reason, t,
                esp_timer_get_time() / 1000, static_cast<unsigned>(xTaskGetTickCount()));
  if (boot == 1) {
    check(reason == ESP_RST_POWERON, "primer arranque: POWERON");
    check(JWPLC_FRAM.put(MARK_ADDR, MARK), "marca escrita en FRAM");
    check(esp_register_shutdown_handler(onShutdown) == ESP_OK, "manejador de apagado registrado");
    check(esp_register_shutdown_handler(onShutdown) == ESP_ERR_INVALID_STATE, "manejador duplicado rechazado");
    return;
  }
  check(reason == ESP_RST_SW, "arranque tras esp_restart: ESP_RST_SW");
  check(t < 1000, "millis() cuenta desde el nuevo arranque");
  uint32_t mark = 0;
  check(JWPLC_FRAM.get(MARK_ADDR, mark) && mark == MARK, "la FRAM conserva la marca");
  if (boot == 3) {
    hw_timer_t *t = timerBegin(1000000);
    timerAttachInterrupt(t, &watchdog);
    timerAlarm(t, 50000, false, 0);   // 50 ms sin alimentar
    check(true, "vigilante armado");
    summary(boot);
  }
  if (boot == 4) {
    check(true, "cuarto arranque tras el reinicio desde la ISR");
    summary(boot);
  }
}

// Las entradas se leen en loop(): el core refresca la imagen de E/S entre
// vueltas (ciclo de PLC).
void loop() {
  if (boot == 1) {
    while (Serial.available()) {
      const char c = static_cast<char>(Serial.read());
      if (c != '\n') {
        line += c;
        continue;
      }
      check(line == "REINICIAR", "orden por consola");
      check(digitalRead(I0_2) == HIGH, "I0_2 en alto antes del reinicio");
      summary(boot);
      ESP.restart();
    }
  } else if (boot == 2) {
    static bool first = true;
    if (first) {
      first = false;
      check(digitalRead(I0_2) == HIGH, "la entrada I0_2 sigue en alto tras el reinicio");
    }
    if (digitalRead(I0_5) == HIGH) {
      Serial.printf("I0_5 en alto a los %lu ms del arranque\n", millis());
      check(true, "estímulo posterior al reinicio aplicado");
      summary(boot);
      delay(100);
      esp_restart();
    }
  }
  delay(10);
}
