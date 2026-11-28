// Curso JWPLC Basic · Lección 50 · Consignas desde el celular
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La banda de cajas de la lección 49, ahora por lotes: el jefe de producción
// fija desde el panel web cuántas cajas lleva el lote (la «meta»). Al
// llegarla, la banda para sola. S1 (I0.1) arranca un lote nuevo, S2 (I0.2,
// NC) para, B1 (I0.0) cuenta y KM1 (Q0.0) mueve la banda.
//
// writable(WEB_OPERADOR) deja cambiar la variable desde el panel a un usuario
// con rol Operador o mayor; range() pone el mínimo y el máximo: un valor
// fuera de rango se rechaza y no llega al programa.

#include <JWPLC_Web.h>

long cajas = 0;
long meta = 10;
bool banda = false;

bool sensorAntes = false;
bool metaAvisada = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 50: la meta del lote se cambia desde el panel web");

    JWPLC_Web.begin("Banda de cajas");
    JWPLC_Web.publish("cajas", cajas).label("Cajas del lote").unit("u");
    JWPLC_Web.publish("meta", meta).label("Meta del lote").unit("u").range(1, 100).writable(WEB_OPERADOR);
    JWPLC_Web.publish("banda", banda).label("Banda en marcha");
}

void loop()
{
    // ---- S1: lote nuevo (si el anterior ya se cumplió, el contador vuelve a 0).
    if (digitalRead(I0_1) && !banda)
    {
        if (cajas >= meta)
            cajas = 0;
        banda = true;
        metaAvisada = false;
    }
    if (!digitalRead(I0_2))
        banda = false;             // S2, parada (NC)

    // ---- Contar cajas.
    bool sensor = digitalRead(I0_0);
    if (sensor && !sensorAntes)
    {
        cajas = cajas + 1;
        Serial.printf("Caja %ld de %ld\n", cajas, meta);
    }
    sensorAntes = sensor;

    // ---- Meta cumplida: la banda para sola y se avisa una vez.
    if (banda && cajas >= meta)
    {
        banda = false;
        if (!metaAvisada)
            Serial.printf("Meta cumplida: %ld cajas\n", cajas);
        metaAvisada = true;
    }
    digitalWrite(Q0_0, banda);

    static bool avisado = false;
    if (!avisado && JWPLC_Web.url().length() > 0)
    {
        avisado = true;
        Serial.print("Panel web: ");
        Serial.println(JWPLC_Web.url());
    }
}
