// Curso JWPLC Basic · Lección 07 · Flancos: encender y apagar con un pulsador
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Un contacto mecánico "rebota": al cerrarse se abre y se cierra varias veces
// en pocos milisegundos. Si el programa lo leyera en cada vuelta, contaría una
// pulsación como varias. Por eso se lee solo cada 20 ms: el rebote ya pasó.
const uint32_t ANTIRREBOTE_MS = 20;
uint32_t ultimaLectura = 0;

// Lectura de la vuelta anterior. Empieza en false: pulsador suelto.
bool antes = false;

// Estado del telerruptor.
bool luz = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 07: cada pulsación en I0.0 cambia Q0.0");
}

void loop()
{
    // Lo que aprendiste en la lección 06: si todavía no pasaron 20 ms, return
    // termina esta vuelta de loop() y el programa sigue con la siguiente.
    if (millis() - ultimaLectura < ANTIRREBOTE_MS)
    {
        return;
    }
    ultimaLectura = millis();

    bool ahora = digitalRead(I0_0) == HIGH;

    // Flanco de subida: ahora está apretado y en la vuelta anterior no.
    if (ahora && !antes)
    {
        luz = !luz;
        digitalWrite(Q0_0, luz);

        Serial.print("Pulsación: Q0.0 ");
        Serial.println(luz ? "encendida" : "apagada");
    }

    // Flanco de bajada: ahora está suelto y en la vuelta anterior no.
    if (!ahora && antes)
    {
        Serial.println("Pulsador suelto");
    }

    // Muy importante: guardar la lectura para compararla en la próxima vuelta.
    antes = ahora;
}
