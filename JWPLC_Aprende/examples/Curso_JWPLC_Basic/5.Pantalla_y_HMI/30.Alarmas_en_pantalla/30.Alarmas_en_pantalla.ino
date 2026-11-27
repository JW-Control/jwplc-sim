// Curso JWPLC Basic · Lección 30 · Alarmas en pantalla
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la bomba con térmico de la lección 26. Si el térmico (I0.2,
// NC) abre, la bomba para y aparece una VENTANA de alarma sobre la pantalla.
// OK la cierra: eso es RECONOCER la alarma, decir «ya la vi».
//
// La lámpara de falla H1 (Q0.1) sigue la norma de los tableros:
//   parpadea   alarma nueva, nadie la reconoció
//   fija       reconocida, pero la causa sigue (el térmico sigue abierto)
//   apagada    reconocida y la causa ya pasó

enum Ventana : uint8_t
{
    ALARMA_TERMICO = 1
};

// Las ventanas se declaran una vez, como los campos. CRIT: roja, queda
// abierta hasta que alguien aprieta OK.
const JWPLC_UIPopup VENTANAS[] = {
    JWPLC_UIPopupCrit(ALARMA_TERMICO, "TERMICO", "Bomba detenida por sobrecarga. OK para reconocer.", "A01")};

enum Campo : uint8_t
{
    CAMPO_TITULO = 1,
    CAMPO_BOMBA,
    CAMPO_ALARMA
};

const uint16_t GRIS = 0x7BEF;
const JWPLC_UIColors COLORES = JWPLC_UIColors(GRIS, JWPLC_TFT_WHITE, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIStyle ARRIBA = JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_STACKED, JWPLC_UI_ALIGN_LEFT);

const JWPLC_UIField CAMPOS[] = {
    JWPLC_UITextField(CAMPO_TITULO, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 20),
                      JWPLC_UITextFieldStyle(2), 0, JWPLC_UIColors(GRIS, JWPLC_TFT_CYAN, JWPLC_TFT_BLACK, GRIS)),
    JWPLC_UIBoolField(CAMPO_BOMBA, JWPLC_UIRect(6, 32, 308, 44), JWPLC_UIText("Bomba"),
                      JWPLC_UIBoolText("PARADA", "MARCHA", JWPLC_TFT_RED, JWPLC_TFT_GREEN), ARRIBA, 0, COLORES),
    JWPLC_UITextField(CAMPO_ALARMA, JWPLC_UIRect(6, 82, 308, 44), JWPLC_UIText("Alarma", nullptr, 16), ARRIBA, 0, COLORES)};

bool motor = false;
bool alarma = false;        // la causa: térmico abierto
bool reconocida = true;     // ¿alguien la vio?
bool ventanaAbierta = false;
bool pantallaLista = false;

void setup()
{
    Serial.begin(115200);

    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_ESC_ONLY);
    JWPLC_Display.setUserRefreshMode(USER_REFRESH_ON_DEMAND);
    JWPLC_Display.setFields(CAMPOS, sizeof(CAMPOS) / sizeof(CAMPOS[0]));
    JWPLC_Display.setPopups(VENTANAS, sizeof(VENTANAS) / sizeof(VENTANAS[0]));
    JWPLC_Display.setText(CAMPO_TITULO, "BOMBA P1");
    JWPLC_Display.clearPendingInput();

    Serial.println("Lección 30: alarmas, marcha I0.0, parada NC I0.1, térmico NC I0.2, falla Q0.1");
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

    // ---- La alarma: aparece en el flanco, una sola vez.
    bool alarmaAntes = alarma;
    alarma = !termicoNormal;
    if (alarma && !alarmaAntes)
    {
        reconocida = false;
        JWPLC_Display.showPopup(ALARMA_TERMICO);
        ventanaAbierta = true;
        Serial.println("Alarma A01: térmico");
    }
    if (!alarma && alarmaAntes)
        Serial.println("A01: térmico normal");

    // La ventana se cierra con OK: la alarma queda reconocida.
    if (ventanaAbierta && !JWPLC_Display.popupActive())
    {
        ventanaAbierta = false;
        reconocida = true;
        Serial.println("A01 reconocida");
    }

    // ---- La bomba
    bool motorAntes = motor;
    motor = (marcha || motor) && paradaSinApretar && !alarma;
    digitalWrite(Q0_0, motor);
    if (motor != motorAntes)
        Serial.println(motor ? "Bomba en marcha" : "Bomba detenida");

    // ---- H1: parpadea sin reconocer, fija con la causa presente.
    bool parpadeo = (millis() / 500) % 2 == 0;
    bool h1 = (!reconocida && parpadeo) || (reconocida && alarma);
    digitalWrite(Q0_1, h1);

    // ---- La pantalla
    JWPLC_Display.setBool(CAMPO_BOMBA, motor);
    JWPLC_Display.setText(CAMPO_ALARMA, !reconocida ? "A01 SIN RECONOCER" : alarma ? "A01 ACTIVA" : "Ninguna");
}
