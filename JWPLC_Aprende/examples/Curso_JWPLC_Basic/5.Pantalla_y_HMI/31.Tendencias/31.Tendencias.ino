// Curso JWPLC Basic · Lección 31 · Tendencias: el ritmo de la cinta en una gráfica
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la cinta del reto 07. S1 la pone en marcha, S0 la detiene y
// el sensor B1 ve pasar cada pieza.
//
// Un número dice cómo está la máquina AHORA; una TENDENCIA dice cómo viene:
// si el ritmo sube, baja o se cayó hace un minuto. La pantalla muestra el
// ritmo (piezas por minuto) como una curva que avanza con el tiempo.
//
// El ritmo se cuenta en una ventana de 30 s partida en 6 casilleros de 5 s:
// cada pieza suma en el casillero actual; cada 5 s se pasa al siguiente y
// se vacía. La suma de los 6 son las piezas de los últimos 30 s; por 2,
// las de un minuto.

enum Campo : uint8_t
{
    CAMPO_TITULO = 1,
    CAMPO_TOTAL,
    CAMPO_RITMO,
    CAMPO_GRAFICA
};

const int CASILLEROS = 6;
const unsigned long CASILLERO_MS = 5000;
const float RITMO_MAX = 60.0f;   // piezas/min, el tope de la escala

const uint16_t GRIS = 0x7BEF;
const JWPLC_UIColors COLORES = JWPLC_UIColors(GRIS, JWPLC_TFT_WHITE, JWPLC_TFT_BLACK, GRIS);
const JWPLC_UIStyle AL_LADO = JWPLC_UIValueStyle(2, 1, true, JWPLC_UI_LAYOUT_INLINE, JWPLC_UI_ALIGN_RIGHT);

// La gráfica tiene muchos ajustes; se arman con nombre, uno por línea.
JWPLC_UITrendConfig configurarGrafica()
{
    JWPLC_UITrendConfig grafica;
    grafica.sampleIntervalMs = 1000;    // un punto por segundo
    grafica.visibleSamples = 120;       // se ven los últimos 2 minutos
    grafica.scaleMode = 1;              // escala fija: de 0 a RITMO_MAX
    grafica.decimals = 0;
    grafica.lineWidth = 2;
    grafica.curveColor = JWPLC_TFT_GREEN;
    grafica.axesColor = GRIS;
    return grafica;
}

const JWPLC_UIField CAMPOS[] = {
    JWPLC_UITextField(CAMPO_TITULO, JWPLC_UIRect(6, 4, 150, 22), JWPLC_UIText(nullptr, nullptr, 12),
                      JWPLC_UITextFieldStyle(2), 0, JWPLC_UIColors(GRIS, JWPLC_TFT_CYAN, JWPLC_TFT_BLACK, GRIS)),
    JWPLC_UIValueField(CAMPO_TOTAL, JWPLC_UIRect(160, 2, 154, 26), JWPLC_UIText("Total"),
                       JWPLC_UIValueFormat(5, 0, false, false), AL_LADO, 0, COLORES),
    JWPLC_UIValueField(CAMPO_RITMO, JWPLC_UIRect(6, 32, 308, 26), JWPLC_UIText("Ritmo", "pz/min"),
                       JWPLC_UIValueFormat(3, 0, false, false), AL_LADO, 0, COLORES),
    JWPLC_UITrendField(CAMPO_GRAFICA, JWPLC_UIRect(6, 62, 308, 104), JWPLC_UIText("Ritmo", "pz/min"),
                       JWPLC_UIRange(0.0f, RITMO_MAX), configurarGrafica())};

bool cinta = false;
bool piezaAntes = false;
unsigned long total = 0;
int casilleros[CASILLEROS] = {0, 0, 0, 0, 0, 0};
int actual = 0;
unsigned long inicioCasillero = 0;
int ritmo = 0;
bool pantallaLista = false;

// Vacía la ventana: el ritmo vuelve a contarse desde cero.
void vaciarVentana()
{
    for (int i = 0; i < CASILLEROS; i++)
    {
        casilleros[i] = 0;
    }
    actual = 0;
    ritmo = 0;
    inicioCasillero = millis();
}

void setup()
{
    Serial.begin(115200);

    JWPLC_Display.setIdleWakeButton(BTN_OK);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_BUTTON_ONLY);
    JWPLC_Display.setIdleReturnMode(IDLE_RETURN_ESC_ONLY);
    JWPLC_Display.setUserRefreshMode(USER_REFRESH_ON_DEMAND);
    JWPLC_Display.setFields(CAMPOS, sizeof(CAMPOS) / sizeof(CAMPOS[0]));
    JWPLC_Display.setText(CAMPO_TITULO, "CINTA 1");
    JWPLC_Display.clearPendingInput();

    vaciarVentana();
    Serial.println("Lección 31: tendencias, marcha I0.0, parada NC I0.1, sensor B1 I0.2");
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

    // ---- La cinta: marcha y parada con enclavamiento.
    bool cintaAntes = cinta;
    cinta = paradaSinApretar && (marcha || cinta);
    if (cinta && !cintaAntes)
    {
        vaciarVentana();
        Serial.println("Cinta en marcha");
    }
    if (!cinta && cintaAntes)
    {
        Serial.println("Cinta detenida");
    }

    // ---- Cada pieza, una vez (flanco de subida de B1).
    if (pieza && !piezaAntes)
    {
        total = total + 1;
        casilleros[actual] = casilleros[actual] + 1;
    }
    piezaAntes = pieza;

    // ---- Cada 5 s: el ritmo de los últimos 30 s y un casillero nuevo.
    if (millis() - inicioCasillero >= CASILLERO_MS)
    {
        inicioCasillero = inicioCasillero + CASILLERO_MS;

        int suma = 0;
        for (int i = 0; i < CASILLEROS; i++)
        {
            suma = suma + casilleros[i];
        }
        ritmo = suma * 2;   // 30 s por 2 = un minuto

        actual = (actual + 1) % CASILLEROS;
        casilleros[actual] = 0;

        if (cinta)
        {
            Serial.printf("Ritmo: %d piezas/min, total %lu\n", ritmo, total);
        }
    }

    digitalWrite(Q0_0, cinta);

    // ---- La pantalla. setTrend() se llama en cada vuelta: el package toma
    //      un punto cada sampleIntervalMs y corre la curva.
    JWPLC_Display.setValue(CAMPO_TOTAL, (float)total);
    JWPLC_Display.setValue(CAMPO_RITMO, (float)ritmo);
    JWPLC_Display.setTrend(CAMPO_GRAFICA, (float)ritmo);
}
