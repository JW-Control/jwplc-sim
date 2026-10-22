// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_W5500_MODEL: cliente TCP del W5500. Con la red lista (DHCP de la
// red virtual), pide GET /jwplc a la puerta de enlace 192.168.250.1:18080
// (un servidor HTTP del host) e imprime la primera línea de la respuesta
// ("STATUS ...") y la última ("BODY ...").
static EthernetClient client;
static bool done = false;

void setup() {
  Serial.begin(115200);
  delay(300);
  JWPLC_Ethernet.useDHCP();
  Serial.println("HTTP: esperando Ethernet");
}

void loop() {
  if (done || !JWPLC_Ethernet.isReady()) return;
  done = true;
  Serial.print("IP ");
  Serial.println(JWPLC_Ethernet.localIP());
  if (client.connect(IPAddress(192, 168, 250, 1), 18080) != 1) {
    Serial.println("CONNECT FAIL");
    return;
  }
  client.print("GET /jwplc HTTP/1.0\r\nHost: 192.168.250.1\r\n\r\n");
  String first, line, last;
  const uint32_t t0 = millis();
  while (millis() - t0 < 3000) {
    while (client.available() > 0) {
      const char c = static_cast<char>(client.read());
      if (c == '\n') {
        if (first.isEmpty()) first = line;
        line = "";
      } else if (c != '\r') {
        line += c;
      }
    }
    if (!client.connected() && client.available() == 0) break;
    delay(1);
  }
  if (!line.isEmpty()) last = line;
  client.stop();
  Serial.print("STATUS ");
  Serial.println(first);
  Serial.print("BODY ");
  Serial.println(last);
}
