// Curso JWPLC Basic · Lección 32 · Proyecto: la HMI de una cinta de lotes
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una cinta que llena lotes. S1 la pone en marcha, S0 la
// detiene y B1 cuenta cada pieza. Al completar el lote, la cinta para sola.
// Si en marcha pasan 20 s sin pieza, la cinta está atascada: para y salta la
// alarma A01.
//
// Todo lo de la Unidad 5 en una sola pantalla de tres páginas:
//   1 PROCESO     estado, lote, total y ritmo         (lecciones 26 y 27)
//   2 TENDENCIA   el ritmo en una curva               (lección 31)
//   3 AJUSTES     el tamaño del lote, guardado en FRAM (lecciones 29 y 22)
// LEFT y RIGHT cambian de página (lección 28); la alarma es una ventana que
// se reconoce con OK (lección 30).

enum Pagina : uint8_t
{
    PAG_PROCESO = 0,
    PAG_TENDENCIA,
    PAG_AJUSTES
};
const uint8_t PAGINAS = 3;

enum Campo : uint8_t
{
    CAMPO_TIT_PROCESO = 1,
    CAMPO_CINTA,
    CAMPO_LOTE,
    CAMPO_TOTAL,
    CAMPO_RITMO,
    CAMPO_TIT_TENDENCIA,
    CAMPO_GRAFICA,
    CAMPO_TIT_AJUSTES,
    CAMPO_TAMANO,
    CAMPO_EDITA,
    CAMPO_AYUDA
};

enum Ventana : uint8_t
{
    ALARMA_ATASCO = 1
};

const int LOTE_MIN = 1;
const int LOTE_MAX = 50;
const unsigned long ATASCO_MS = 20000;
const int CASILLEROS = 6;               // ventana del ritmo: 6 x 5 s
const unsigned long CASILLERO_MS = 5000;

const uint16_t GRIS = 0x7BEF;
const JWPLC_UIColors COLORES = JWPLC_UIColors(GRIS, JWPLC_TFT_WHITE, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIColors TITULO = JWPLC_UIColors(GRIS, JWPLC_TFT_CYAN, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIStyle ARRIBA = JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_STACKED, JWPLC_UI_ALIGN_LEFT);

JWPLC_UITrendConfig configurarGrafica()
{
    JWPLC_UITrendConfig grafica;
    grafica.sampleIntervalMs = 1000;
    grafica.visibleSamples = 120;
    grafica.scaleMode = 1;
    grafica.decimals = 0;
    grafica.lineWidth = 2;
    grafica.curveColor = JWPLC_TFT_GREEN;
    grafica.axesColor = GRIS;
    return grafica;
}

const JWPLC_UIPopup VENTANAS[] = {
    JWPLC_UIPopupCrit(ALARMA_ATASCO, "ATASCO", "20 s sin piezas: revise la cinta. OK para reconocer.", "A01")};

const JWPLC_UIField CAMPOS[] = {
    // Página 1: PROCESO
    JWPLC_UITextField(CAMPO_TIT_PROCESO, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 24),
                      JWPLC_UITextFieldStyle(2), PAG_PROCESO, TITULO),
    JWPLC_UIBoolField(CAMPO_CINTA, JWPLC_UIRect(6, 32, 150, 44), JWPLC_UIText("Cinta"),
                      JWPLC_UIBoolText("PARADA", "MARCHA", JWPLC_TFT_RED, JWPLC_TFT_GREEN), ARRIBA, PAG_PROCESO, COLORES),
    JWPLC_UITextField(CAMPO_LOTE, JWPLC_UIRect(164, 32, 150, 44), JWPLC_UIText("Lote", nullptr, 8),
                      ARRIBA, PAG_PROCESO, COLORES),
    JWPLC_UIValueField(CAMPO_TOTAL, JWPLC_UIRect(6, 82, 150, 44), JWPLC_UIText("Total"),
                       JWPLC_UIValueFormat(5, 0, false, false), ARRIBA, PAG_PROCESO, COLORES),
    JWPLC_UIValueField(CAMPO_RITMO, JWPLC_UIRect(164, 82, 150, 44), JWPLC_UIText("Ritmo", "pz/min"),
                       JWPLC_UIValueFormat(3, 0, false, false), ARRIBA, PAG_PROCESO, COLORES),

    // Página 2: TENDENCIA
    JWPLC_UITextField(CAMPO_TIT_TENDENCIA, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 24),
                      JWPLC_UITextFieldStyle(2), PAG_TENDENCIA, TITULO),
    JWPLC_UITrendField(CAMPO_GRAFICA, JWPLC_UIRect(6, 32, 308, 132), JWPLC_UIText("Ritmo", "pz/min"),
                       JWPLC_UIRange(0.0f, 60.0f), configurarGrafica(), PAG_TENDENCIA),

    // Página 3: AJUSTES
    JWPLC_UITextField(CAMPO_TIT_AJUSTES, JWPLC_UIRect(6, 4, 308, 22), JWPLC_UIText(nullptr, nullptr, 24),
                      JWPLC_UITextFieldStyle(2), PAG_AJUSTES, TITULO),
    JWPLC_UIValueField(CAMPO_TAMANO, JWPLC_UIRect(6, 32, 200, 44), JWPLC_UIText("Piezas por lote"),
                       JWPLC_UIValueFormat(2, 0, false, false), ARRIBA, PAG_AJUSTES, COLORES),
    JWPLC_UIBoolField(CAMPO_EDITA, JWPLC_UIRect(212, 32, 102, 44), JWPLC_UIText("Modo"),
                      JWPLC_UIBoolText("FIJO", "EDITA", GRIS, JWPLC_TFT_BLACK, JWPLC_TFT_BLACK, JWPLC_TFT_YELLOW), ARRIBA, PAG_AJUSTES, COLORES),
    JWPLC_UITextField(CAMPO_AYUDA, JWPLC_UIRect(6, 90, 308, 22), JWPLC_UIText(nullptr, nullptr, 40),
                      JWPLC_UITextFieldStyle(1), PAG_AJUSTES, COLORES)};

// ---- Los ajustes, en la FRAM
struct Ajustes
{
    int piezasPorLote;
};
const unsigned long DIRECCION = 0;
const uint8_t VERSION = 1;
Ajustes ajustes = {10};
int editado = 10;
bool editando = false;

// ---- La máquina
bool cinta = false;
bool piezaAntes = false;
int lote = 0;
unsigned long total = 0;
unsigned long ultimaPieza = 0;
int lotes = 0;                  // lotes completos desde el encendido
unsigned long inicioLote = 0;
unsigned long ultimoAviso = 0;

// ---- La alarma
bool alarmaAbierta = false;     // la ventana sigue en pantalla

// ---- El ritmo
int casilleros[CASILLEROS] = {0, 0, 0, 0, 0, 0};
int actual = 0;
unsigned long inicioCasillero = 0;
int ritmo = 0;

uint8_t pagina = PAG_PROCESO;
bool pantallaLista = false;

void mostrarPagina()
{
    JWPLC_Display.setUserPage(pagina);
    Serial.printf("Página %d\n", pagina + 1);
}

void leerBotonera()
{
    // Con la ventana de alarma abierta, la botonera es de la ventana.
    if (alarmaAbierta)
        return;

    if (editando)
    {
        if (JWPLC_Buttons.pressed(BTN_UP) && editado < LOTE_MAX)
            editado = editado + 1;
        if (JWPLC_Buttons.pressed(BTN_DOWN) && editado > LOTE_MIN)
            editado = editado - 1;
        if (JWPLC_Buttons.pressed(BTN_OK))
        {
            ajustes.piezasPorLote = editado;
            JWPLC_FRAM.writeBlock(DIRECCION, ajustes, VERSION);
            editando = false;
            Serial.printf("Lote: %d piezas (guardado)\n", ajustes.piezasPorLote);
        }
        if (JWPLC_Buttons.pressed(BTN_ESC))
        {
            editando = false;
            Serial.println("Cancelado");
        }
        return;     // mientras se edita, LEFT y RIGHT no cambian de página
    }

    if (JWPLC_Buttons.pressed(BTN_RIGHT) && pagina < PAGINAS - 1)
    {
        pagina = pagina + 1;
        mostrarPagina();
    }
    if (JWPLC_Buttons.pressed(BTN_LEFT) && pagina > 0)
    {
        pagina = pagina - 1;
        mostrarPagina();
    }
    if (pagina == PAG_AJUSTES && JWPLC_Buttons.pressed(BTN_OK))
    {
        editando = true;
        editado = ajustes.piezasPorLote;
        Serial.println("Editando");
    }
}

void contarRitmo(bool piezaNueva)
{
    if (piezaNueva)
        casilleros[actual] = casilleros[actual] + 1;

    if (millis() - inicioCasillero >= CASILLERO_MS)
    {
        inicioCasillero = inicioCasillero + CASILLERO_MS;
        int suma = 0;
        for (int i = 0; i < CASILLEROS; i++)
            suma = suma + casilleros[i];
        ritmo = suma * 2;
        actual = (actual + 1) % CASILLEROS;
        casilleros[actual] = 0;
    }
}

void setup()
{
    Serial.begin(115200);

    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_DISABLED);   // ESC cancela la edición
    JWPLC_Display.setUserRefreshMode(USER_REFRESH_ON_DEMAND);
    JWPLC_Display.setFields(CAMPOS, sizeof(CAMPOS) / sizeof(CAMPOS[0]));
    JWPLC_Display.setPopups(VENTANAS, sizeof(VENTANAS) / sizeof(VENTANAS[0]));
    JWPLC_Display.setText(CAMPO_TIT_PROCESO, "CINTA 1   PROCESO 1/3");
    JWPLC_Display.setText(CAMPO_TIT_TENDENCIA, "CINTA 1   RITMO   2/3");
    JWPLC_Display.setText(CAMPO_TIT_AJUSTES, "CINTA 1   AJUSTES 3/3");
    JWPLC_Display.clearPendingInput();

    Serial.println("Lección 32: cinta de lotes, marcha I0.0, parada NC I0.1, sensor B1 I0.2, falla Q0.1");

    if (JWPLC_FRAM.readBlock(DIRECCION, ajustes, VERSION) && ajustes.piezasPorLote >= LOTE_MIN && ajustes.piezasPorLote <= LOTE_MAX)
        Serial.printf("Recuperado: lote de %d piezas\n", ajustes.piezasPorLote);
    else
    {
        ajustes.piezasPorLote = 10;
        Serial.printf("Lote: %d piezas\n", ajustes.piezasPorLote);
    }
    inicioCasillero = millis();
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
    bool pieza = digitalRead(I0_2) == HIGH;
    bool piezaNueva = pieza && !piezaAntes;
    piezaAntes = pieza;

    leerBotonera();

    // ---- La alarma se reconoce al cerrar la ventana con OK.
    if (alarmaAbierta && !JWPLC_Display.popupActive())
    {
        alarmaAbierta = false;
        Serial.println("A01 reconocida");
    }

    // ---- La cinta
    // Con la alarma sin reconocer, la cinta no arranca: alguien tiene que
    // ver el atasco antes de volver a ponerla en marcha.
    if (marcha && !cinta && paradaSinApretar && alarmaAbierta)
    {
        if (millis() - ultimoAviso >= 1000)
        {
            ultimoAviso = millis();
            Serial.println("Reconozca la alarma A01");
        }
    }
    else if (marcha && !cinta && paradaSinApretar)
    {
        cinta = true;
        ultimaPieza = millis();     // el reloj del atasco empieza ahora
        if (lote >= ajustes.piezasPorLote)
            lote = 0;               // lote nuevo
        if (lote == 0)
            inicioLote = millis();
        Serial.println("Cinta en marcha");
    }
    if (cinta && !paradaSinApretar)
    {
        cinta = false;
        Serial.println("Cinta detenida");
    }

    if (piezaNueva)
    {
        total = total + 1;
        if (cinta)
        {
            lote = lote + 1;
            ultimaPieza = millis();
        }
    }
    if (cinta && lote >= ajustes.piezasPorLote)
    {
        cinta = false;
        Serial.printf("Lote completo: %d piezas\n", lote);
        lotes = lotes + 1;
        unsigned long segundos = (millis() - inicioLote) / 1000;
        Serial.printf("Lote %d completo en %02lu:%02lu\n", lotes, segundos / 60, segundos % 60);
    }
    if (cinta && millis() - ultimaPieza >= ATASCO_MS)
    {
        cinta = false;
        alarmaAbierta = true;
        JWPLC_Display.showPopup(ALARMA_ATASCO);
        Serial.println("Alarma A01: atasco");
    }

    contarRitmo(piezaNueva);

    digitalWrite(Q0_0, cinta);
    // H1 parpadea mientras la alarma espera que alguien la reconozca.
    digitalWrite(Q0_1, alarmaAbierta && (millis() / 500) % 2 == 0);

    // ---- La pantalla: se escribe todo; el package repinta solo lo que
    //      cambió y solo en la página visible.
    char textoLote[12];
    snprintf(textoLote, sizeof(textoLote), "%d / %d", lote, ajustes.piezasPorLote);
    JWPLC_Display.setBool(CAMPO_CINTA, cinta);
    JWPLC_Display.setText(CAMPO_LOTE, textoLote);
    JWPLC_Display.setValue(CAMPO_TOTAL, (float)total);
    JWPLC_Display.setValue(CAMPO_RITMO, (float)ritmo);
    JWPLC_Display.setTrend(CAMPO_GRAFICA, (float)ritmo);
    JWPLC_Display.setValue(CAMPO_TAMANO, (float)(editando ? editado : ajustes.piezasPorLote));
    JWPLC_Display.setBool(CAMPO_EDITA, editando);
    JWPLC_Display.setText(CAMPO_AYUDA, editando ? "UP/DOWN cambia  OK guarda  ESC cancela" : "OK: ajustar el lote");
}
