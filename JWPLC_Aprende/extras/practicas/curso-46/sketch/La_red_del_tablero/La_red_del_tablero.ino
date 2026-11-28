// Curso JWPLC Basic · Lección 46 · La red del tablero: dirección IP fija
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un tablero que se une a la red Ethernet de la planta. Cada
// equipo de la red tiene su dirección IP; la del JWPLC la fija el programa,
// para que la PC del supervisor y los demás equipos sepan dónde buscarlo.
//
//   IP del JWPLC     192.168.250.10
//   máscara          255.255.255.0   (la red es 192.168.250.x)
//   puerta de enlace 192.168.250.1   (el router de la planta)
//
// La red la atiende el JWPLC por su cuenta: el programa solo elige la
// dirección en setup() y mira el estado. H1 (Q0.0) es el piloto «red lista».

IPAddress IP_JWPLC(192, 168, 250, 10);
IPAddress ROUTER(192, 168, 250, 1);
IPAddress MASCARA(255, 255, 255, 0);

bool redLista = false;
unsigned long ultimoAviso = 0;

void setup()
{
    Serial.begin(115200);
    // Antes de que termine setup(): la red arranca con esta dirección.
    JWPLC_Ethernet.setStaticIP(IP_JWPLC, ROUTER, ROUTER, MASCARA);
    Serial.println("Lección 46: IP fija 192.168.250.10, piloto H1 en Q0.0");
}

void loop()
{
    bool antes = redLista;
    redLista = JWPLC_Ethernet.isReady();

    if (redLista && !antes)
    {
        Serial.print("Red lista. IP: ");
        Serial.println(JWPLC_Ethernet.localIP());
    }
    if (!redLista && antes)
        Serial.println("Red perdida");

    // Mientras espera, el estado cada 2 s (el mismo código que el ETH de la pantalla).
    if (!redLista && millis() - ultimoAviso >= 2000)
    {
        ultimoAviso = millis();
        Serial.print("Esperando la red: ");
        Serial.print(JWPLC_Ethernet.diagnosticCode());
        Serial.print(" (");
        Serial.print(JWPLC_Ethernet.statusString());
        Serial.println(")");
    }

    digitalWrite(Q0_0, redLista);
}
