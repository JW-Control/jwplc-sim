// Curso JWPLC Basic · Lección 10 · Contadores
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

const uint16_t PIEZAS_POR_CAJA = 10;
const uint32_t ANTIRREBOTE_MS = 20;

uint16_t piezas = 0;
uint32_t ultimaLectura = 0;

// Detector de flanco de subida (como en la lección 07), dentro de un struct:
// cada detector recuerda su lectura anterior. subida() devuelve true solo en
// la vuelta en que la señal pasa de apagada a activa.
struct Flanco
{
    bool antes = false;

    bool subida(bool ahora)
    {
        bool flanco = ahora && !antes;
        antes = ahora;
        return flanco;
    }
};

// Un detector para cada señal.
Flanco flancoSensor;
Flanco flancoReset;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 10: piezas en I0.0, RESET en I0.1");
}

void loop()
{
    if (millis() - ultimaLectura < ANTIRREBOTE_MS)
    {
        return;
    }
    ultimaLectura = millis();

    bool cajaLlena = piezas >= PIEZAS_POR_CAJA;

    // Solo se cuentan piezas mientras la caja no esté llena.
    if (flancoSensor.subida(digitalRead(I0_0) == HIGH) && !cajaLlena)
    {
        piezas++;
        Serial.print("Piezas: ");
        Serial.println(piezas);

        if (piezas == PIEZAS_POR_CAJA)
        {
            Serial.println("Caja llena: cambia la caja y aprieta RESET");
        }
    }

    if (flancoReset.subida(digitalRead(I0_1) == HIGH))
    {
        piezas = 0;
        Serial.println("RESET: caja nueva");
    }

    // Se vuelve a calcular porque la cuenta pudo cambiar en esta vuelta.
    cajaLlena = piezas >= PIEZAS_POR_CAJA;
    digitalWrite(Q0_0, !cajaLlena);
    digitalWrite(Q0_1, cajaLlena);
}
