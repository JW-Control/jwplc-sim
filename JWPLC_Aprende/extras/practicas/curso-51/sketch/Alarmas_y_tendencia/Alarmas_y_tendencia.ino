// Curso JWPLC Basic · Lección 51 · Alarmas y tendencia en el panel web
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La banda de cajas de la lección 49 con una alarma de atasco: si el sensor
// B1 (I0.0) queda tapado más de 3 s, una caja se trabó. La banda KM1 (Q0.0)
// para, el piloto H1 (Q0.1) se enciende y el panel web muestra la alarma
// para que el operador la reconozca. S1 (I0.1) arranca y S2 (I0.2, NC) para.
//
// addAlarm() declara la alarma en setup(); setAlarm() la enciende o la apaga
// en el loop. trend() guarda la variable en la tendencia del panel.

#include <JWPLC_Web.h>

long cajas = 0;
bool banda = false;

bool sensorAntes = false;
unsigned long tapadoDesde = 0;
bool atasco = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 51: alarma de atasco y tendencia en el panel web");

    JWPLC_Web.begin("Banda de cajas");
    JWPLC_Web.publish("cajas", cajas).label("Cajas contadas").unit("u").trend();
    JWPLC_Web.publish("banda", banda).label("Banda en marcha");
    JWPLC_Web.addAlarm("atasco", "Caja atascada frente a B1", WEB_ALARMA_ALTA);
    JWPLC_Web.trendEvery(5);       // un punto cada 5 s: los últimos 10 minutos
}

void loop()
{
    bool sensor = digitalRead(I0_0);

    // ---- Atasco: B1 tapado más de 3 s seguidos.
    if (sensor && !sensorAntes)
        tapadoDesde = millis();
    bool atascoAhora = sensor && millis() - tapadoDesde > 3000;
    if (atascoAhora && !atasco)
        Serial.println("Alarma: caja atascada");
    atasco = atascoAhora;
    JWPLC_Web.setAlarm("atasco", atasco);

    // ---- Marcha y parada: con atasco la banda para y no arranca.
    if (digitalRead(I0_1) && !atasco)
        banda = true;
    if (!digitalRead(I0_2) || atasco)
        banda = false;
    digitalWrite(Q0_0, banda);
    digitalWrite(Q0_1, atasco);    // H1, piloto de falla

    // ---- Contar cajas.
    if (sensor && !sensorAntes)
    {
        cajas = cajas + 1;
        Serial.printf("Caja %ld\n", cajas);
    }
    sensorAntes = sensor;

    static bool avisado = false;
    if (!avisado && JWPLC_Web.url().length() > 0)
    {
        avisado = true;
        Serial.print("Panel web: ");
        Serial.println(JWPLC_Web.url());
    }
}
