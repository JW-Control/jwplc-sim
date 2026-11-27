// Curso JWPLC Basic · Lección 28 · Páginas: la botonera recorre la pantalla
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el tanque de la lección 27. Ahora la información no entra en
// una sola pantalla, así que se reparte en PÁGINAS: Proceso, Contadores y
// Reloj. LEFT y RIGHT pasan de una a otra.
//
// Cada campo dice en qué página va (el número antes de los colores). El
// package solo dibuja los de la página que se ve.

enum Campo : uint8_t
{
    // Página 0: proceso
    CAMPO_TITULO_0 = 1,
    CAMPO_ESTADO,
    CAMPO_BOMBA,
    CAMPO_NIVEL_BAJO,
    // Página 1: contadores
    CAMPO_TITULO_1,
    CAMPO_LLENADOS,
    CAMPO_TIEMPO_BOMBA,
    // Página 2: reloj
    CAMPO_TITULO_2,
    CAMPO_HORA,
    CAMPO_FECHA
};

const uint8_t PAGINAS = 3;

const uint16_t GRIS = 0x7BEF;
const JWPLC_UIColors COLORES = JWPLC_UIColors(GRIS, JWPLC_TFT_WHITE, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIColors TITULO = JWPLC_UIColors(GRIS, JWPLC_TFT_CYAN, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIStyle ARRIBA = JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_STACKED, JWPLC_UI_ALIGN_LEFT);
const JWPLC_UIStyle LINEA = JWPLC_UITextFieldStyle(2, 1, false);

const JWPLC_UIField CAMPOS[] = {
    // Página 0: proceso
    JWPLC_UITextField(CAMPO_TITULO_0, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 20), LINEA, 0, TITULO),
    JWPLC_UITextField(CAMPO_ESTADO, JWPLC_UIRect(6, 32, 200, 44), JWPLC_UIText("Estado", nullptr, 10), ARRIBA, 0, COLORES),
    JWPLC_UIBoolField(CAMPO_BOMBA, JWPLC_UIRect(212, 32, 102, 44), JWPLC_UIText("Bomba"),
                      JWPLC_UIBoolText("PARADA", "MARCHA", JWPLC_TFT_RED, JWPLC_TFT_GREEN), ARRIBA, 0, COLORES),
    JWPLC_UIBoolField(CAMPO_NIVEL_BAJO, JWPLC_UIRect(6, 82, 308, 44), JWPLC_UIText("Nivel"),
                      JWPLC_UIBoolText("NORMAL", "BAJO", JWPLC_TFT_GREEN, JWPLC_TFT_YELLOW), ARRIBA, 0, COLORES),
    // Página 1: contadores
    JWPLC_UITextField(CAMPO_TITULO_1, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 20), LINEA, 1, TITULO),
    JWPLC_UIValueField(CAMPO_LLENADOS, JWPLC_UIRect(6, 32, 308, 44), JWPLC_UIText("Llenados"),
                       JWPLC_UIValueFormat(5, 0, false, false), ARRIBA, 1, COLORES),
    // Duración: el valor va en segundos y se muestra como mm:ss.
    JWPLC_UIValueField(CAMPO_TIEMPO_BOMBA, JWPLC_UIRect(6, 82, 308, 44), JWPLC_UIText("Bomba en marcha (mm:ss)"),
                       JWPLC_UIDurationFormat(JWPLC_UI_DURATION_MM_SS), ARRIBA, 1, COLORES),
    // Página 2: reloj. Hora y fecha no necesitan variable: las lee del RTC.
    JWPLC_UITextField(CAMPO_TITULO_2, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 20), LINEA, 2, TITULO),
    JWPLC_UIValueField(CAMPO_HORA, JWPLC_UIRect(6, 32, 308, 44), JWPLC_UIText("Hora"),
                       JWPLC_UIDateTimeFormat(JWPLC_UI_DATETIME_HH_MM_SS), ARRIBA, 2, COLORES),
    JWPLC_UIValueField(CAMPO_FECHA, JWPLC_UIRect(6, 82, 308, 44), JWPLC_UIText("Fecha"),
                       JWPLC_UIDateTimeFormat(JWPLC_UI_DATETIME_DD_MM_YYYY), ARRIBA, 2, COLORES)};

uint8_t pagina = 0;
bool bomba = false;
unsigned long llenados = 0;
unsigned long segundosBomba = 0;
unsigned long ultimoSegundo = 0;
bool pantallaLista = false;

void mostrarPagina(uint8_t nueva)
{
    pagina = nueva;
    JWPLC_Display.setUserPage(pagina);
    Serial.printf("Página %u\n", pagina + 1);
}

void setup()
{
    Serial.begin(115200);

    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_ESC_ONLY);
    JWPLC_Display.setUserRefreshMode(USER_REFRESH_ON_DEMAND);
    JWPLC_Display.setFields(CAMPOS, sizeof(CAMPOS) / sizeof(CAMPOS[0]));
    JWPLC_Display.setText(CAMPO_TITULO_0, "PROCESO      1/3");
    JWPLC_Display.setText(CAMPO_TITULO_1, "CONTADORES   2/3");
    JWPLC_Display.setText(CAMPO_TITULO_2, "RELOJ        3/3");
    JWPLC_Display.clearPendingInput();

    Serial.println("Lección 28: páginas, LEFT y RIGHT; tanque B1 I0.0, B2 I0.1, selector I0.2");
}

void loop()
{
    if (!pantallaLista && JWPLC_Display.isReady())
    {
        pantallaLista = true;
        JWPLC_Display.enterUserUI();
        mostrarPagina(0);
    }

    // La botonera: RIGHT avanza, LEFT retrocede, sin pasar de los extremos.
    if (JWPLC_Buttons.pressed(BTN_RIGHT) && pagina < PAGINAS - 1)
        mostrarPagina(pagina + 1);
    if (JWPLC_Buttons.pressed(BTN_LEFT) && pagina > 0)
        mostrarPagina(pagina - 1);

    // El proceso, igual que en la lección 27.
    bool hayAguaEnB1 = digitalRead(I0_0) == HIGH;
    bool lleno = digitalRead(I0_1) == HIGH;
    bool habilitado = digitalRead(I0_2) == HIGH;

    bool bombaAntes = bomba;
    if (habilitado && !hayAguaEnB1)
        bomba = true;
    if (lleno || !habilitado)
        bomba = false;
    if (!bomba && bombaAntes && lleno)
    {
        llenados = llenados + 1;
        Serial.printf("Tanque lleno. Llenados: %lu\n", llenados);
    }

    // Horómetro de la bomba: suma un segundo por cada segundo en marcha.
    if (millis() - ultimoSegundo >= 1000)
    {
        ultimoSegundo = ultimoSegundo + 1000;
        if (bomba)
            segundosBomba = segundosBomba + 1;
    }

    digitalWrite(Q0_0, bomba);
    digitalWrite(Q0_1, habilitado);
    digitalWrite(Q0_2, !hayAguaEnB1);

    // Se actualizan todos los campos, se vean o no: el package dibuja solo
    // los de la página visible.
    JWPLC_Display.setText(CAMPO_ESTADO, !habilitado ? "DETENIDO" : bomba ? "LLENANDO" : "EN NIVEL");
    JWPLC_Display.setBool(CAMPO_BOMBA, bomba);
    JWPLC_Display.setBool(CAMPO_NIVEL_BAJO, !hayAguaEnB1);
    JWPLC_Display.setValue(CAMPO_LLENADOS, llenados);
    JWPLC_Display.setValue(CAMPO_TIEMPO_BOMBA, segundosBomba);
}
