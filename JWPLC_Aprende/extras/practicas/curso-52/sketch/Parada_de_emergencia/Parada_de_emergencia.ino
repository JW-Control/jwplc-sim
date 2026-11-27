// Curso JWPLC Basic · Lección 52 · Parada de emergencia y rearme
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un motor con marcha y parada (lección 08), ahora con su
// parada de emergencia, la seta roja. Dos reglas de oficio:
//
// 1. La emergencia CORTA POR CABLE. Su contacto NC 11-12 alimenta el común
//    de la salida Q0.0: si alguien la aprieta, la bobina de KM1 se queda sin
//    tensión aunque el programa falle. El programa también la lee (I0.3)
//    para saber qué pasó, pero no depende de él que el motor pare.
//
// 2. Soltar la seta NO vuelve a arrancar nada. Hace falta un REARME (el
//    pulsador azul, I0.2) y después una marcha nueva. Una máquina que
//    arranca sola cuando alguien gira la seta es una máquina peligrosa.
//
// Estados:  NORMAL → EMERGENCIA (seta apretada) → ESPERA_REARME (seta
//           suelta) → NORMAL (rearme), con el motor siempre parado.

enum Estado : uint8_t
{
    NORMAL,
    EMERGENCIA,
    ESPERA_REARME
};

Estado estado = NORMAL;
bool motor = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 52: emergencia NC I0.3, rearme I0.2, marcha I0.0, parada NC I0.1");
    // Si al encender la seta ya está apretada, se empieza en emergencia.
    if (digitalRead(I0_3) == LOW)
    {
        estado = EMERGENCIA;
        Serial.println("EMERGENCIA al encender");
    }
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    bool rearme = digitalRead(I0_2) == HIGH;
    bool setaSuelta = digitalRead(I0_3) == HIGH;    // NC: HIGH = sin apretar

    // ---- La emergencia manda sobre todo.
    if (!setaSuelta && estado != EMERGENCIA)
    {
        estado = EMERGENCIA;
        motor = false;
        Serial.println("EMERGENCIA");
    }
    if (setaSuelta && estado == EMERGENCIA)
    {
        estado = ESPERA_REARME;
        Serial.println("Emergencia liberada: apriete Rearme");
    }
    if (rearme && estado == ESPERA_REARME)
    {
        estado = NORMAL;
        Serial.println("Rearmado: la máquina espera una marcha");
    }

    // ---- El motor, solo en NORMAL (lección 08).
    bool motorAntes = motor;
    if (estado == NORMAL)
        motor = (marcha || motor) && paradaSinApretar;
    else
        motor = false;
    if (motor != motorAntes)
        Serial.println(motor ? "Motor en marcha" : "Motor detenido");

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, estado != NORMAL);      // H1: emergencia o sin rearmar
}
