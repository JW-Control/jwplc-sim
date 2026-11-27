// Curso JWPLC Basic · Lección 26 · La pantalla: el estado de la máquina a la vista
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la bomba de la lección 08 (marcha I0.0, parada NC I0.1,
// contactor Q0.0). Ahora el operador ve en la pantalla si está en marcha o
// parada, sin mirar el contactor.
//
// La pantalla la maneja el package. Tu programa le dice qué dibujar en dos
// funciones que él llama: jwplcUIEnter() al entrar a tu pantalla y
// jwplcUIUpdate() varias veces por segundo mientras se ve.

// Colores en formato RGB565, el de la pantalla: 5 bits rojo, 6 verde, 5 azul.
const uint16_t GRIS = 0x7BEF;
const uint16_t GRIS_CLARO = 0xC618;

bool motor = false;
bool pantallaLista = false;   // ¿ya se pasó de la pantalla de estado a la nuestra?
bool dibujado = false;        // ¿la pantalla muestra el estado actual del motor?

// Dibuja lo que no cambia: el título y la línea de abajo.
extern "C" void jwplcUIEnter()
{
    JWPLC_TFT.fillScreen(JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextWrap(false);

    JWPLC_TFT.setTextColor(JWPLC_TFT_CYAN, JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextSize(2);
    JWPLC_TFT.setCursor(10, 10);
    JWPLC_TFT.print("BOMBA P1");

    JWPLC_TFT.drawFastHLine(10, 32, 300, GRIS);

    JWPLC_TFT.setTextColor(GRIS_CLARO, JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextSize(1);
    JWPLC_TFT.setCursor(10, 150);
    JWPLC_TFT.print("Marcha I0.0  Parada I0.1");

    dibujado = false;   // lo que cambia se dibuja en jwplcUIUpdate()
}

// Dibuja lo que cambia, solo cuando cambia.
extern "C" void jwplcUIUpdate()
{
    if (dibujado)
        return;
    dibujado = true;

    uint16_t color = motor ? JWPLC_TFT_GREEN : JWPLC_TFT_RED;
    JWPLC_TFT.fillRoundRect(10, 50, 300, 80, 10, color);
    JWPLC_TFT.setTextColor(JWPLC_TFT_BLACK, color);
    JWPLC_TFT.setTextSize(4);
    // Tamaño 4: cada letra mide 24 x 32 píxeles; 6 letras = 144 de ancho,
    // centradas en el recuadro (x de 10 a 310) empiezan en 88.
    JWPLC_TFT.setCursor(88, 74);
    JWPLC_TFT.print(motor ? "MARCHA" : "PARADA");
}

void setup()
{
    Serial.begin(115200);

    // Al arrancar el equipo muestra su pantalla de estado (IDLE). ESC vuelve
    // a ella desde la nuestra; OK abre otra vez la nuestra.
    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_ESC_ONLY);
    JWPLC_Display.setUserRefreshPeriodMs(100);
    JWPLC_Display.clearPendingInput();

    Serial.println("Lección 26: la pantalla, bomba P1 marcha I0.0, parada NC I0.1");
}

void loop()
{
    // La primera vez que la pantalla está lista, pasa a la nuestra.
    if (!pantallaLista && JWPLC_Display.isReady())
    {
        pantallaLista = true;
        JWPLC_Display.enterUserUI();
    }

    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;   // NC: activa en reposo

    bool motorAntes = motor;
    motor = (marcha || motor) && paradaSinApretar;
    digitalWrite(Q0_0, motor);

    if (motor != motorAntes)
    {
        dibujado = false;   // la pantalla tiene que mostrar el estado nuevo
        Serial.println(motor ? "Motor en marcha" : "Motor detenido");
    }
}
