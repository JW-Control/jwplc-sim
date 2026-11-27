// Curso JWPLC Basic · Lección 56 · Primera falla: ¿qué pasó primero?
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un compresor con tres protecciones NC:
//   I0.2  F1, térmico del motor
//   I0.3  B2, presostato de aceite
//   I0.4  B3, nivel de aceite
// Cuando una dispara, el motor para... y muchas veces otra dispara detrás
// (sin motor, cae la presión de aceite). El técnico llega y ve DOS fallas:
// ¿cuál fue la causa? La PRIMERA FALLA (first-out) es la que se memoriza
// sola, con su hora; las demás se anotan como «también».
//
// ESC en la botonera reconoce, pero solo si ya no queda ninguna causa
// activa. H1 (Q0.1) es la lámpara de falla.

const int ENTRADAS[] = {I0_2, I0_3, I0_4};
const String NOMBRES[] = {"TERMICO", "PRESION DE ACEITE", "NIVEL DE ACEITE"};
const uint8_t CANTIDAD = 3;
const int NINGUNA = -1;

bool motor = false;
bool disparo = false;
int primera = NINGUNA;
bool anotada[CANTIDAD] = {};

String hora()
{
    char texto[10];
    snprintf(texto, sizeof(texto), "%02u:%02u:%02u", JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
    return String(texto);
}

// La primera causa activa que encuentre, o NINGUNA.
int causaActiva()
{
    for (uint8_t k = 0; k < CANTIDAD; k++)
        if (digitalRead(ENTRADAS[k]) == LOW)
            return k;
    return NINGUNA;
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 56: primera falla, térmico I0.2, presión I0.3, nivel I0.4 (NC), ESC reconoce");
}

void loop()
{
    // ---- Memorizar la primera y anotar las demás.
    for (uint8_t k = 0; k < CANTIDAD; k++)
    {
        bool activa = digitalRead(ENTRADAS[k]) == LOW;
        if (!activa || anotada[k])
            continue;
        anotada[k] = true;
        if (!disparo)
        {
            disparo = true;
            primera = k;
            Serial.printf("Primera falla: %s a las %s\n", NOMBRES[k].c_str(), hora().c_str());
        }
        else
            Serial.printf("También: %s\n", NOMBRES[k].c_str());
    }

    // ---- Reconocer con ESC, solo sin causas activas.
    if (JWPLC_Buttons.pressed(BTN_ESC) && disparo && causaActiva() == NINGUNA)
    {
        disparo = false;
        primera = NINGUNA;
        for (uint8_t k = 0; k < CANTIDAD; k++)
            anotada[k] = false;
        Serial.println("Fallas reconocidas");
    }

    // ---- El motor (lección 08), bloqueado con falla.
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    bool motorAntes = motor;
    motor = (marcha || motor) && paradaSinApretar && !disparo;
    if (motor != motorAntes)
        Serial.println(motor ? "Compresor en marcha" : "Compresor detenido");

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, disparo);
}
