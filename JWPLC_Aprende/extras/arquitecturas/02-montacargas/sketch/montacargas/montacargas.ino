// Montacargas de 3 paradas · JWPLC Basic
//
// Motor trifásico con inversión (KM1 sube, KM2 baja, enclavados entre sí por
// sus auxiliares NC) y relé térmico F1. Finales de sobrerrecorrido y parada
// de emergencia cableados en serie con las bobinas: actúan aunque el PLC
// falle. El PLC atiende las llamadas de piso, para en el final del piso
// pedido y no arranca con una puerta abierta, con sobrecarga o con el
// térmico disparado.
//   I0_0 SQ0, final de carrera planta baja      Q0_0 KM1, subir
//   I0_1 SQ1, final de carrera piso 1           Q0_1 KM2, bajar
//   I0_2 SQ2, final de carrera piso 2           Q0_2 H1, ámbar: en movimiento
//   I0_3 SB0, llamada planta baja               Q0_3 H2, rojo: falla
//   I0_4 SB1, llamada piso 1
//   I0_5 SB2, llamada piso 2
//   I0_6 SP, cadena de puertas (cerrado = las 3 puertas cerradas)
//   I0_7 F1 95-96 + celda de carga (cerrado = sin térmico ni sobrecarga)
// Fallas en la pantalla: E01 puerta abierta en marcha, E02 sobrecarga o
// térmico, E03 el piso no llega a tiempo (sobrerrecorrido o motor trabado).
// Con la cabina detenida, BTN_OK de la placa repone la falla.

static const uint8_t PISOS = 3;
static const uint16_t FINAL[PISOS] = {I0_0, I0_1, I0_2};
static const uint16_t LLAMADA[PISOS] = {I0_3, I0_4, I0_5};
static const uint32_t TIEMPO_PISO_MS = 16000;  // 3 m a 0,3 m/s son 10 s
static const uint32_t ESPERA_MS = 1500;        // con la puerta cerrada, antes de arrancar

enum Estado : uint8_t { DETENIDO, SUBIENDO, BAJANDO, FALLA };
static Estado estado = DETENIDO;
static int8_t piso = -1;          // último final de piso visto
static bool pedido[PISOS] = {};
static int8_t destino = -1;
static uint32_t desde = 0;        // inicio del viaje o de la espera
static bool listo = false;        // espera cumplida
static char codigo[4] = "";

static void falla(const char *c, const char *texto)
{
    strncpy(codigo, c, 3);
    JWPLC_Display.setErrCode(codigo);
    Serial.printf("FALLA %s: %s\n", c, texto);
    estado = FALLA;
}

static const char *nombre(int8_t p) { return p == 0 ? "PB" : p == 1 ? "P1" : p == 2 ? "P2" : "--"; }

static int8_t elegirDestino()
{
    // Primero las llamadas en el sentido del último viaje; si no, la más cercana.
    int8_t mejor = -1;
    for (int8_t p = 0; p < PISOS; p++)
        if (pedido[p] && p != piso && (mejor < 0 || abs(p - piso) < abs(mejor - piso))) mejor = p;
    return mejor;
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_DISABLED);
    JWPLC_Display.setErrCode("");
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Montacargas de 3 paradas listo");
}

void loop()
{
    const uint32_t ahora = millis();
    const bool puertas = digitalRead(I0_6);
    const bool seguro = digitalRead(I0_7);

    for (int8_t p = 0; p < PISOS; p++)
    {
        if (digitalRead(FINAL[p]) && piso != p)
        {
            piso = p;
            Serial.printf("Piso %s\n", nombre(p));
        }
        if (digitalRead(LLAMADA[p]) && !pedido[p] && !(estado == DETENIDO && piso == p))
        {
            pedido[p] = true;
            Serial.printf("Llamada a %s\n", nombre(p));
        }
    }
    const bool enPiso = piso >= 0 && digitalRead(FINAL[piso]);

    switch (estado)
    {
    case DETENIDO:
        if (!seguro)
        {
            if (codigo[0] != 'E') falla("E02", "sobrecarga o térmico: no arranca");
            break;
        }
        destino = elegirDestino();
        if (destino < 0 || !puertas)
        {
            desde = ahora;
            break;
        }
        if (ahora - desde < ESPERA_MS) break;
        if (piso < 0)
        {
            // Arranque entre pisos: baja despacio hasta encontrar un final.
            estado = BAJANDO;
        }
        else estado = destino > piso ? SUBIENDO : BAJANDO;
        desde = ahora;
        Serial.printf("Viaje %s -> %s\n", nombre(piso), nombre(destino));
        break;

    case SUBIENDO:
    case BAJANDO:
        if (!puertas) { falla("E01", "puerta abierta en marcha"); break; }
        if (!seguro) { falla("E02", "sobrecarga o térmico en marcha"); break; }
        if (ahora - desde > TIEMPO_PISO_MS * PISOS) { falla("E03", "el piso no llega a tiempo"); break; }
        if (enPiso && piso == destino)
        {
            estado = DETENIDO;
            pedido[piso] = false;
            desde = ahora;
            Serial.printf("Llegó a %s\n", nombre(piso));
        }
        else if (enPiso && destino < 0)
        {
            estado = DETENIDO;
            desde = ahora;
        }
        break;

    case FALLA:
        if (JWPLC_Buttons.pressed(BTN_OK) && seguro)
        {
            for (bool &p : pedido) p = false;
            codigo[0] = 0;
            JWPLC_Display.setErrCode("");
            Serial.println("Falla repuesta");
            estado = DETENIDO;
            desde = ahora;
        }
        break;
    }

    digitalWrite(Q0_0, estado == SUBIENDO);
    digitalWrite(Q0_1, estado == BAJANDO);
    digitalWrite(Q0_2, (estado == SUBIENDO || estado == BAJANDO) && (ahora / 400) % 2);
    digitalWrite(Q0_3, estado == FALLA);
    delay(1);
}
