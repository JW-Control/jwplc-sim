// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_NVS_PREFERENCES: semántica de la NVS de ESP-IDF v5 vista desde
// Preferences, EEPROM y la API nvs_* directa. Corre dos veces sobre el mismo
// directorio de estado: el primer arranque escribe, el segundo verifica que
// todo persistió y lo borra. Imprime "[PASS]"/"[FAIL]" por caso y al final
// "NVS arranque N: P PASS, F FAIL".
#include <EEPROM.h>
#include <Preferences.h>
#include <nvs.h>

Preferences prefs;
int passed = 0;
int failed = 0;

void check(bool ok, const char *what) {
  Serial.print(ok ? "[PASS] " : "[FAIL] ");
  Serial.println(what);
  (ok ? passed : failed)++;
}

void firstBoot() {
  check(prefs.begin("g4", false), "begin() lectura/escritura");
  check(prefs.putUChar("u8", 200) == 1, "putUChar devuelve 1 byte");
  check(prefs.putShort("i16", -1234) == 2, "putShort");
  check(prefs.putUInt("u32", 0xDEADBEEF) == 4, "putUInt");
  check(prefs.putLong64("i64", -1234567890123LL) == 8, "putLong64");
  check(prefs.putFloat("f", 3.25f) == sizeof(float), "putFloat (blob)");
  check(prefs.putDouble("d", -2.5) == sizeof(double), "putDouble (blob)");
  check(prefs.putBool("b", true) == 1, "putBool");
  check(prefs.putString("s", "JWPLC Basic") == 11, "putString");
  const uint8_t blob[5] = {1, 2, 3, 4, 5};
  check(prefs.putBytes("blob", blob, sizeof(blob)) == 5, "putBytes");
  check(prefs.getBytesLength("blob") == 5, "getBytesLength");
  check(prefs.isKey("u32") && !prefs.isKey("nada"), "isKey");
  check(prefs.getType("u8") == PT_U8 && prefs.getType("s") == PT_STR && prefs.getType("blob") == PT_BLOB, "getType");
  // Tipos distintos: la clave existe solo con su tipo.
  check(prefs.getUInt("u8", 7) == 7, "leer con otro tipo da el valor por defecto");
  check(prefs.putString("clave_de_16_char", "x") == 0, "clave de 16 caracteres rechazada");
  check(prefs.remove("i16") && !prefs.isKey("i16"), "remove");
  check(!prefs.remove("i16"), "remove de una clave inexistente falla");
  const size_t before = prefs.freeEntries();
  static char largo[1001];
  memset(largo, 'x', 1000);
  check(prefs.putString("largo", largo) == 1000, "putString de 1000 bytes");
  check(prefs.freeEntries() < before && before - prefs.freeEntries() >= 1000 / 32, "freeEntries descuenta las entradas de la cadena");
  check(prefs.remove("largo"), "remove de la cadena larga");
  prefs.end();

  check(prefs.begin("g4", true), "begin() solo lectura");
  check(prefs.putUChar("u8", 1) == 0 && prefs.getUChar("u8") == 200, "escribir en solo lectura falla");
  prefs.end();
  check(!prefs.begin("ns_inexistente", true), "abrir en solo lectura un namespace inexistente falla");

  // Dos namespaces con la misma clave son independientes.
  prefs.begin("otro", false);
  prefs.putUChar("u8", 9);
  prefs.end();

  // API nvs_* directa: códigos de error y consulta de longitud.
  nvs_handle_t h;
  check(nvs_open("g4", NVS_READWRITE, &h) == ESP_OK, "nvs_open");
  size_t len = 0;
  check(nvs_get_str(h, "s", nullptr, &len) == ESP_OK && len == 12, "nvs_get_str consulta la longitud con el NUL");
  char small[4];
  len = sizeof(small);
  check(nvs_get_str(h, "s", small, &len) == ESP_ERR_NVS_INVALID_LENGTH, "buffer corto da INVALID_LENGTH");
  uint16_t v16;
  check(nvs_get_u16(h, "u8", &v16) == ESP_ERR_NVS_NOT_FOUND, "otro tipo da NOT_FOUND");
  check(nvs_set_str(h, "", "x") == ESP_ERR_NVS_INVALID_NAME || nvs_set_str(h, "", "x") == ESP_ERR_NVS_KEY_TOO_LONG ||
            nvs_set_str(h, "", "x") != ESP_OK,
        "clave vacía rechazada");
  nvs_type_t type;
  check(nvs_find_key(h, "i64", &type) == ESP_OK && type == NVS_TYPE_I64, "nvs_find_key informa el tipo");
  check(nvs_commit(h) == ESP_OK, "nvs_commit");
  nvs_close(h);
  check(nvs_commit(h) == ESP_ERR_NVS_INVALID_HANDLE, "handle cerrado da INVALID_HANDLE");

  // EEPROM: emulada sobre un blob de la NVS.
  check(EEPROM.begin(64), "EEPROM.begin(64)");
  for (int i = 0; i < 64; ++i) EEPROM.write(i, static_cast<uint8_t>(i * 3));
  EEPROM.writeString(40, "eeprom");
  check(EEPROM.commit(), "EEPROM.commit");
  EEPROM.end();
}

void secondBoot() {
  check(prefs.begin("g4", true), "begin() tras reiniciar");
  check(prefs.getUChar("u8") == 200, "persiste UChar");
  check(prefs.getUInt("u32") == 0xDEADBEEF, "persiste UInt");
  check(prefs.getLong64("i64") == -1234567890123LL, "persiste Long64");
  check(prefs.getFloat("f") == 3.25f && prefs.getDouble("d") == -2.5, "persisten float y double");
  check(prefs.getBool("b") == true, "persiste Bool");
  check(prefs.getString("s") == "JWPLC Basic", "persiste String");
  uint8_t blob[5] = {};
  check(prefs.getBytes("blob", blob, sizeof(blob)) == 5 && blob[0] == 1 && blob[4] == 5, "persisten los bytes");
  check(!prefs.isKey("i16") && !prefs.isKey("largo"), "lo borrado sigue borrado");
  prefs.end();
  prefs.begin("otro", false);
  check(prefs.getUChar("u8") == 9, "namespace independiente");
  check(prefs.clear() && !prefs.isKey("u8"), "clear() vacía el namespace");
  prefs.end();

  check(EEPROM.begin(64), "EEPROM.begin tras reiniciar");
  bool same = true;
  for (int i = 0; i < 40; ++i) same &= EEPROM.read(i) == static_cast<uint8_t>(i * 3);
  check(same && EEPROM.readString(40) == "eeprom", "persiste la EEPROM");
  EEPROM.end();

  prefs.begin("g4", false);
  check(prefs.clear(), "limpieza final");
  prefs.end();
}

void setup() {
  Serial.begin(115200);
  prefs.begin("arranque", false);
  const uint32_t boot = prefs.getUInt("n", 0) + 1;
  prefs.putUInt("n", boot);
  prefs.end();
  if (boot == 1) firstBoot();
  else secondBoot();
  Serial.print("NVS arranque ");
  Serial.print(boot);
  Serial.print(": ");
  Serial.print(passed);
  Serial.print(" PASS, ");
  Serial.print(failed);
  Serial.println(" FAIL");
}

void loop() { delay(1000); }
