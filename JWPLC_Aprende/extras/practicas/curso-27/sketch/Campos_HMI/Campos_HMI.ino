// Curso JWPLC Basic · Lección 27 · Campos HMI: el tanque en la pantalla
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un tanque que se descarga por Y1 y se llena con la bomba KM1.
// Con el selector en I, la bomba arranca cuando el agua baja de B1 y para al
// llegar a B2 (histéresis, como en la lección 10).
//
// En lugar de dibujar cada cosa, esta vez se declaran CAMPOS: el package los
// dibuja, con su rótulo, y solo los repinta cuando su valor cambia.

// Un número para cada campo.
enum Campo : uint8_t
{
    CAMPO_ESTADO = 1,
    CAMPO_BOMBA,
    CAMPO_LLENADOS,
    CAMPO_LLENADO
};

const unsigned long TIEMPO_MAX_MS = 30000;   // un llenado normal tarda menos

// Colores (RGB565) y estilo común: rótulo chico arriba, valor grande abajo,
// dentro de un marco.
const uint16_t GRIS = 0x7BEF;
const JWPLC_UIColors COLORES = JWPLC_UIColors(GRIS, JWPLC_TFT_WHITE, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIStyle ARRIBA = JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_STACKED, JWPLC_UI_ALIGN_LEFT);

// La pantalla (320 x 170): dónde va cada campo (x, y, ancho, alto), su
// rótulo y cómo se muestra. Se declara una vez; el package la dibuja.
const JWPLC_UIField CAMPOS[] = {
    JWPLC_UITextField(CAMPO_ESTADO, JWPLC_UIRect(6, 6, 200, 44), JWPLC_UIText("Estado", nullptr, 10), ARRIBA, 0, COLORES),
    JWPLC_UIBoolField(CAMPO_BOMBA, JWPLC_UIRect(212, 6, 102, 44), JWPLC_UIText("Bomba"),
                      JWPLC_UIBoolText("PARADA", "MARCHA", JWPLC_TFT_RED, JWPLC_TFT_GREEN), ARRIBA, 0, COLORES),
    JWPLC_UIValueField(CAMPO_LLENADOS, JWPLC_UIRect(6, 56, 308, 44), JWPLC_UIText("Llenados"),
                       JWPLC_UIValueFormat(4, 0, false, false), ARRIBA, 0, COLORES),
    JWPLC_UIBarField(CAMPO_LLENADO, JWPLC_UIRect(6, 106, 308, 58), JWPLC_UIText("Tiempo de llenado"),
                     JWPLC_UIRange(0.0f, 100.0f), JWPLC_UIBarStyle(1, true), 0,
                     JWPLC_UIColors(GRIS, JWPLC_TFT_CYAN, JWPLC_TFT_BLACK, GRIS))};

bool bomba = false;
unsigned long inicioBomba = 0;
unsigned long llenados = 0;
bool pantallaLista = false;

void setup()
{
    Serial.begin(115200);

    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_ESC_ONLY);
    // ON_DEMAND: la pantalla se repinta solo cuando un campo cambia.
    JWPLC_Display.setUserRefreshMode(USER_REFRESH_ON_DEMAND);
    JWPLC_Display.setFields(CAMPOS, sizeof(CAMPOS) / sizeof(CAMPOS[0]));
    JWPLC_Display.clearPendingInput();

    Serial.println("Lección 27: campos HMI, tanque B1 I0.0, B2 I0.1, selector I0.2");
}

void loop()
{
    if (!pantallaLista && JWPLC_Display.isReady())
    {
        pantallaLista = true;
        JWPLC_Display.enterUserUI();
    }

    bool hayAguaEnB1 = digitalRead(I0_0) == HIGH;
    bool lleno = digitalRead(I0_1) == HIGH;
    bool habilitado = digitalRead(I0_2) == HIGH;

    // La bomba: arranca bajo B1, para en B2 (o si se deshabilita).
    bool bombaAntes = bomba;
    if (habilitado && !hayAguaEnB1)
        bomba = true;
    if (lleno || !habilitado)
        bomba = false;

    if (bomba && !bombaAntes)
    {
        inicioBomba = millis();
        Serial.println("Bomba en marcha");
    }
    if (!bomba && bombaAntes && lleno)
    {
        llenados = llenados + 1;
        Serial.printf("Tanque lleno. Llenados: %lu\n", llenados);
    }

    digitalWrite(Q0_0, bomba);         // KM1, bomba
    digitalWrite(Q0_1, habilitado);    // Y1, descarga
    digitalWrite(Q0_2, !hayAguaEnB1);  // H1, nivel bajo

    // Los campos: se les da el valor en cada vuelta; el package solo repinta
    // los que cambiaron.
    const char *estado = !habilitado ? "DETENIDO" : bomba ? "LLENANDO" : "EN NIVEL";
    JWPLC_Display.setText(CAMPO_ESTADO, estado);
    JWPLC_Display.setBool(CAMPO_BOMBA, bomba);
    JWPLC_Display.setValue(CAMPO_LLENADOS, llenados);

    float avance = 0;
    if (bomba)
        avance = (millis() - inicioBomba) * 100.0f / TIEMPO_MAX_MS;
    if (avance > 100)
        avance = 100;
    JWPLC_Display.setBar(CAMPO_LLENADO, avance);
}
