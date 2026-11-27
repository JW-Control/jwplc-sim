// Curso JWPLC Basic · Lección 29 · Ajustar parámetros desde el frente
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una mezcladora. MARCHA (I0.0) la pone en marcha (Q0.0) durante
// el tiempo ajustado y para sola; PARADA (I0.1, NC) la detiene antes.
//
// El tiempo se ajusta en la pantalla, como en un equipo comercial:
//   OK         empieza a editar (el aviso EDITA se pone amarillo)
//   UP / DOWN  cambian el valor de a 5 s, entre 5 y 60
//   OK         guarda el valor nuevo
//   ESC        cancela y deja el que estaba

enum Campo : uint8_t
{
    CAMPO_TITULO = 1,
    CAMPO_ESTADO,
    CAMPO_TIEMPO,
    CAMPO_RESTA,
    CAMPO_EDITA,
    CAMPO_AYUDA
};

const unsigned long TIEMPO_MIN = 5;
const unsigned long TIEMPO_MAX = 60;
const unsigned long PASO = 5;

const uint16_t GRIS = 0x7BEF;
const JWPLC_UIColors COLORES = JWPLC_UIColors(GRIS, JWPLC_TFT_WHITE, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIStyle ARRIBA = JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_STACKED, JWPLC_UI_ALIGN_LEFT);

const JWPLC_UIField CAMPOS[] = {
    JWPLC_UITextField(CAMPO_TITULO, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 20),
                      JWPLC_UITextFieldStyle(2), 0, JWPLC_UIColors(GRIS, JWPLC_TFT_CYAN, JWPLC_TFT_BLACK, GRIS)),
    JWPLC_UIBoolField(CAMPO_ESTADO, JWPLC_UIRect(6, 32, 150, 44), JWPLC_UIText("Mezcladora"),
                      JWPLC_UIBoolText("PARADA", "MARCHA", JWPLC_TFT_RED, JWPLC_TFT_GREEN), ARRIBA, 0, COLORES),
    JWPLC_UIValueField(CAMPO_RESTA, JWPLC_UIRect(164, 32, 150, 44), JWPLC_UIText("Falta", "s"),
                       JWPLC_UIValueFormat(2, 0, false, false), ARRIBA, 0, COLORES),
    JWPLC_UIValueField(CAMPO_TIEMPO, JWPLC_UIRect(6, 82, 200, 44), JWPLC_UIText("Tiempo de mezcla", "s"),
                       JWPLC_UIValueFormat(2, 0, false, false), ARRIBA, 0, COLORES),
    // A su lado, un aviso que se pone amarillo mientras se edita.
    JWPLC_UIBoolField(CAMPO_EDITA, JWPLC_UIRect(212, 82, 102, 44), JWPLC_UIText("Modo"),
                      JWPLC_UIBoolText("FIJO", "EDITA", GRIS, JWPLC_TFT_BLACK, JWPLC_TFT_BLACK, JWPLC_TFT_YELLOW), ARRIBA, 0, COLORES),
    JWPLC_UITextField(CAMPO_AYUDA, JWPLC_UIRect(6, 140, 308, 22), JWPLC_UIText(nullptr, nullptr, 40),
                      JWPLC_UITextFieldStyle(1), 0, COLORES)};

unsigned long tiempo = 20;      // segundos: el que usa la máquina
unsigned long editado = 20;     // el que se está editando
bool editando = false;

bool motor = false;
unsigned long inicio = 0;
bool pantallaLista = false;

void setup()
{
    Serial.begin(115200);

    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    // ESC queda para cancelar la edición: no vuelve a la pantalla de estado.
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_DISABLED);
    JWPLC_Display.setUserRefreshMode(USER_REFRESH_ON_DEMAND);
    JWPLC_Display.setFields(CAMPOS, sizeof(CAMPOS) / sizeof(CAMPOS[0]));
    JWPLC_Display.setText(CAMPO_TITULO, "MEZCLADORA");
    JWPLC_Display.clearPendingInput();

    Serial.println("Lección 29: ajustar desde el frente, marcha I0.0, parada NC I0.1");
    Serial.printf("Tiempo: %lu s\n", tiempo);
}

void loop()
{
    if (!pantallaLista && JWPLC_Display.isReady())
    {
        pantallaLista = true;
        JWPLC_Display.enterUserUI();
    }

    // ---- La edición
    if (!editando && JWPLC_Buttons.pressed(BTN_OK))
    {
        editando = true;
        editado = tiempo;           // se parte del valor actual
        Serial.println("Editando");
    }
    else if (editando)
    {
        if (JWPLC_Buttons.pressed(BTN_UP) && editado + PASO <= TIEMPO_MAX)
            editado = editado + PASO;
        if (JWPLC_Buttons.pressed(BTN_DOWN) && editado >= TIEMPO_MIN + PASO)
            editado = editado - PASO;
        if (JWPLC_Buttons.pressed(BTN_OK))
        {
            tiempo = editado;       // recién ahora la máquina usa el valor nuevo
            editando = false;
            Serial.printf("Tiempo: %lu s\n", tiempo);
        }
        if (JWPLC_Buttons.pressed(BTN_ESC))
        {
            editando = false;       // el valor editado se descarta
            Serial.println("Cancelado");
        }
    }

    // ---- La mezcladora
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;

    if (marcha && !motor && paradaSinApretar)
    {
        motor = true;
        inicio = millis();
        Serial.printf("Mezclando %lu s\n", tiempo);
    }
    if (motor && (!paradaSinApretar || millis() - inicio >= tiempo * 1000))
    {
        motor = false;
        Serial.println("Mezcla terminada");
    }
    digitalWrite(Q0_0, motor);

    // ---- La pantalla
    unsigned long falta = 0;
    if (motor)
        falta = tiempo - (millis() - inicio) / 1000;

    JWPLC_Display.setBool(CAMPO_ESTADO, motor);
    JWPLC_Display.setValue(CAMPO_RESTA, falta);
    JWPLC_Display.setValue(CAMPO_TIEMPO, editando ? editado : tiempo);
    JWPLC_Display.setBool(CAMPO_EDITA, editando);
    JWPLC_Display.setText(CAMPO_AYUDA, editando ? "UP/DOWN cambia  OK guarda  ESC cancela" : "OK: ajustar el tiempo");
}
