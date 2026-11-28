// Curso JWPLC Basic · Lección 49 · El panel web: la banda en el celular
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la banda de cajas de la lección 47. S1 (I0.1) la arranca,
// S2 (I0.2, NC) la para, el sensor B1 (I0.0) cuenta las cajas y el
// contactor KM1 (Q0.0) mueve la banda.
//
// JWPLC_Web arma un panel web con las variables que el programa publica:
// se abre en el navegador del celular o de la PC, en la misma red, sin
// escribir HTML. La primera vez pide el código de 6 dígitos que sale en el
// Monitor Serie y crea el usuario administrador.

#include <JWPLC_Web.h>

// Lo que se publica son variables globales: el panel las lee directamente.
long cajas = 0;
bool banda = false;

bool sensorAntes = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 49: panel web de la banda");

    JWPLC_Web.begin("Banda de cajas");
    JWPLC_Web.publish("cajas", cajas).label("Cajas contadas").unit("u");
    JWPLC_Web.publish("banda", banda).label("Banda en marcha");
}

void loop()
{
    // ---- Marcha y parada desde el tablero.
    if (digitalRead(I0_1))
        banda = true;              // S1, marcha (NA)
    if (!digitalRead(I0_2))
        banda = false;             // S2, parada (NC)
    digitalWrite(Q0_0, banda);

    // ---- Contar cajas: flanco de subida del sensor (lección 07).
    bool sensor = digitalRead(I0_0);
    if (sensor && !sensorAntes)
    {
        cajas = cajas + 1;
        Serial.printf("Caja %ld\n", cajas);
    }
    sensorAntes = sensor;

    // ---- La dirección del panel, una vez, cuando la red tiene IP.
    static bool avisado = false;
    if (!avisado && JWPLC_Web.url().length() > 0)
    {
        avisado = true;
        Serial.print("Panel web: ");
        Serial.println(JWPLC_Web.url());
    }
}
