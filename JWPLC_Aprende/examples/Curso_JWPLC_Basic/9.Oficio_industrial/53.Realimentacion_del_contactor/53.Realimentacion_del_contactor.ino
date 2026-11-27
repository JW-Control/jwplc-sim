// Curso JWPLC Basic · Lección 53 · Diagnóstico: ¿el contactor hizo caso?
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el motor de siempre (lección 08). Que el programa ponga
// Q0.0 en HIGH no quiere decir que el motor gire: la bobina puede estar
// quemada, un cable suelto, el contactor trabado.
//
// La REALIMENTACIÓN: el contacto auxiliar NA del contactor (13-14) vuelve a
// una entrada (I0.2). El programa compara lo que MANDÓ con lo que PASÓ:
//   mandó cerrar y a los 300 ms sigue abierto   → «Falla KM1: no cierra»
// Un contactor tarda unos 20 ms en cerrar; 300 ms dejan margen de sobra.
//
// La falla queda ENCLAVADA: el motor no arranca hasta que alguien la
// reconoce con ESC en la botonera. H1 (Q0.1) es la lámpara de falla.

const unsigned long TIEMPO_RESPUESTA_MS = 300;

bool motor = false;           // lo que el programa quiere
bool falla = false;
unsigned long cambioOrden = 0;   // cuándo cambió la orden
bool ordenAntes = false;

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 53: realimentación de KM1 en I0.2, falla H1 en Q0.1, ESC reconoce");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    bool cerrado = digitalRead(I0_2) == HIGH;       // aux 13-14 de KM1

    // ---- El motor (lección 08), bloqueado si hay falla.
    bool motorAntes = motor;
    motor = (marcha || motor) && paradaSinApretar && !falla;
    if (motor != motorAntes)
        Serial.println(motor ? "Motor en marcha" : "Motor detenido");

    // ---- Cada cambio de orden reinicia el tiempo de respuesta.
    if (motor != ordenAntes)
        cambioOrden = millis();
    ordenAntes = motor;

    // ---- Comparar la orden con la realimentación.
    bool vencido = millis() - cambioOrden >= TIEMPO_RESPUESTA_MS;
    if (vencido && motor && !cerrado && !falla)
    {
        falla = true;
        motor = false;
        Serial.println("Falla KM1: no cierra");
    }

    // ---- ESC reconoce la falla.
    if (JWPLC_Buttons.pressed(BTN_ESC) && falla)
    {
        falla = false;
        Serial.println("Falla reconocida");
    }

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, falla);
}
