// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_SD_DATALOG: registro de datos en la microSD con JWPLCDataLog
// (JW_SD del package). Cada 100 ms agrega "ms,I0_0,I0_1,hh:mm:ss" a
// /datalog.csv; la hora del sistema se toma del RTC (los archivos quedan con
// la fecha real). Informa el estado cada segundo y, a los 6 s, lo informa
// una vez más, cierra el
// registro y relee el archivo: "DATALOG lineas=N bytes=B".
#include <sys/time.h>

JWPLCDataLog logger;
bool clockSet = false;

void setClockFromRtc() {
  if (clockSet || !JWPLC_Time.valid()) return;
  struct tm tm = {};
  tm.tm_year = JWPLC_Time.year() - 1900;
  tm.tm_mon = JWPLC_Time.month() - 1;
  tm.tm_mday = JWPLC_Time.day();
  tm.tm_hour = JWPLC_Time.hour();
  tm.tm_min = JWPLC_Time.minute();
  tm.tm_sec = JWPLC_Time.second();
  const struct timeval tv = {mktime(&tm), 0};
  settimeofday(&tv, nullptr);
  clockSet = true;
}

void setup() {
  Serial.begin(115200);
  pinMode(I0_0, INPUT);
  pinMode(I0_1, INPUT);
  delay(200);
  setClockFromRtc();
  // Búfer de 1 KiB; commit a los 256 bytes o al segundo.
  const bool ok = logger.begin(JWPLC_SD, "/datalog.csv", 1024, 256, 1000);
  Serial.printf("logger begin=%d sd_ready=%d\n", ok, JWPLC_SD.isReady());
}

void loop() {
  static uint32_t lastSample = 0, lastReport = 0;
  static bool closed = false;
  const uint32_t now = millis();
  if (closed) {
    delay(100);
    return;
  }
  if (now - lastSample >= 100) {
    lastSample = now;
    time_t t = time(nullptr);
    struct tm tm;
    localtime_r(&t, &tm);
    char line[48];
    snprintf(line, sizeof(line), "%lu,%d,%d,%02d:%02d:%02d", static_cast<unsigned long>(now), digitalRead(I0_0),
             digitalRead(I0_1), tm.tm_hour, tm.tm_min, tm.tm_sec);
    logger.writeLine(line);
  }
  logger.service();
  // Estado cada segundo y al cerrar (la última cuenta coincide con el archivo).
  if (now - lastReport >= 1000 || now >= 6000) {
    lastReport = now;
    Serial.printf("t=%lu presente=%d lista=%d aceptadas=%lu confirmados=%llu commits=%lu fallidos=%lu pendientes=%u\n",
                  static_cast<unsigned long>(now), JWPLC_SD.isCardPresent(), JWPLC_SD.isReady(),
                  static_cast<unsigned long>(logger.acceptedWrites()), static_cast<unsigned long long>(logger.committedBytes()),
                  static_cast<unsigned long>(logger.commitCount()), static_cast<unsigned long>(logger.failedCommits()),
                  static_cast<unsigned>(logger.pendingBytes()));
  }
  if (now >= 6000) {
    closed = true;
    Serial.printf("close=%d\n", logger.close());
    JWPLCFile f = JWPLC_SD.open("/datalog.csv", FILE_READ);
    size_t lines = 0, bytes = 0;
    while (f && f.available()) {
      const int c = f.read();
      bytes++;
      if (c == '\n') lines++;
    }
    if (f) f.close();
    Serial.printf("DATALOG lineas=%u bytes=%u\n", static_cast<unsigned>(lines), static_cast<unsigned>(bytes));
  }
  delay(5);
}
