// Curso JWPLC Basic · Lección 26 · La pantalla · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

const uint16_t GRIS = 0x7BEF;
const uint16_t GRIS_CLARO = 0xC618;
const uint16_t NARANJA = 0xFD20;

bool motor = false;
bool falla = false;               // térmico abierto
unsigned long arranques = 0;
bool pantallaLista = false;
bool dibujado = false;

extern "C" void jwplcUIEnter()
{
    JWPLC_TFT.fillScreen(JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextWrap(false);

    JWPLC_TFT.setTextColor(JWPLC_TFT_CYAN, JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextSize(2);
    JWPLC_TFT.setCursor(10, 10);
    JWPLC_TFT.print("BOMBA P1");

    JWPLC_TFT.drawFastHLine(10, 32, 300, GRIS);
    dibujado = false;
}

extern "C" void jwplcUIUpdate()
{
    if (dibujado)
        return;
    dibujado = true;

    // El recuadro: falla manda sobre marcha y parada.
    uint16_t color = falla ? NARANJA : motor ? JWPLC_TFT_GREEN : JWPLC_TFT_RED;
    const char *texto = falla ? "FALLA" : motor ? "MARCHA" : "PARADA";
    JWPLC_TFT.fillRoundRect(10, 44, 300, 80, 10, color);
    JWPLC_TFT.setTextColor(JWPLC_TFT_BLACK, color);
    JWPLC_TFT.setTextSize(4);
    // Centrado: cada letra mide 24 píxeles de ancho en tamaño 4.
    JWPLC_TFT.setCursor(160 - (int)strlen(texto) * 12, 68);
    JWPLC_TFT.print(texto);

    // La línea de abajo: arranques o el motivo de la falla.
    JWPLC_TFT.fillRect(10, 136, 300, 24, JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextColor(falla ? NARANJA : GRIS_CLARO, JWPLC_TFT_BLACK);
    JWPLC_TFT.setTextSize(2);
    JWPLC_TFT.setCursor(10, 140);
    if (falla)
        JWPLC_TFT.print("Termico abierto");
    else
    {
        JWPLC_TFT.print("Arranques: ");
        JWPLC_TFT.print(arranques);
    }
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_ESC_ONLY);
    JWPLC_Display.setUserRefreshPeriodMs(100);
    JWPLC_Display.clearPendingInput();
    Serial.println("Lección 26: la pantalla, bomba P1 marcha I0.0, parada NC I0.1, térmico NC I0.2");
}

void loop()
{
    if (!pantallaLista && JWPLC_Display.isReady())
    {
        pantallaLista = true;
        JWPLC_Display.enterUserUI();
    }

    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    bool termicoNormal = digitalRead(I0_2) == HIGH;

    bool motorAntes = motor;
    bool fallaAntes = falla;

    falla = !termicoNormal;
    motor = (marcha || motor) && paradaSinApretar && !falla;

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, falla);

    if (motor && !motorAntes)
    {
        arranques = arranques + 1;
        Serial.printf("Arranques: %lu\n", arranques);
    }
    if (motor != motorAntes)
        Serial.println(motor ? "Motor en marcha" : "Motor detenido");
    if (falla && !fallaAntes)
        Serial.println("Falla: térmico");
    if (!falla && fallaAntes)
        Serial.println("Térmico normal");

    if (motor != motorAntes || falla != fallaAntes)
        dibujado = false;
}
