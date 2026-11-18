// Bombeo de edificio a presión constante · JWPLC Basic
//
// Dos bombas centrífugas con variador Delta VFD-EL succionan de la cisterna y
// mantienen la red del edificio a 4,0 bar. El PLC es maestro Modbus RTU
// (RS-485, 9600 8N1):
//   VF1 (dirección 1) y VF2 (dirección 2): 2000H orden, 2001H frecuencia × 100,
//                                          2100H-2103H falla, estado, F y H
//   PT1 (dirección 3): transmisor de presión, registro 0 = bar × 100
// E/S:
//   I0_0  LS1, flotador de la cisterna: cerrado = hay agua sobre la succión
//   I0_1  S1, selector Automático (I) / Apagado (0)
//   Q0_0  H1, piloto verde: bombeando
//   Q0_1  H2, piloto rojo: alarma
// Control: PI de presión sobre la bomba líder; la segunda entra si la líder no
// alcanza a 60 Hz y sale cuando sobra; con poco consumo el sistema duerme y
// alterna la bomba líder al despertar. Fallas: cisterna vacía (E01),
// transmisor abierto o sin respuesta (E02), bomba que no confirma marcha o
// variador en falla (E1x/E2x: entra la otra bomba).

static const float CONSIGNA = 4.0;      // bar
static const float DESPERTAR = 0.5;     // bar bajo la consigna
static const float F_MIN = 25.0;        // Hz
static const float F_MAX = 60.0;        // Hz
static const float KP = 10.0;           // Hz por bar
static const float KI = 6.0;            // Hz por bar·s
static const uint32_t CICLO_MS = 200;

enum Paso : uint8_t { LEER_PT, LEER_VF1, LEER_VF2, ESCRIBIR_VF1, ESCRIBIR_VF2, N_PASOS };

struct Bomba
{
    uint8_t dir;
    bool orden = false;      // el PLC la quiere en marcha
    float hz = 0;            // frecuencia pedida
    uint16_t falla = 0;      // 2100H
    uint16_t estado = 0;     // 2101H
    float hzSalida = 0;      // 2103H
    uint8_t sinRespuesta = 0;
    uint32_t sinConfirmarMs = 0;
    bool bloqueada = false;  // en falla: no se usa hasta reponer (selector a 0)
};

static Bomba bombas[2] = {{1}, {2}};
static uint8_t lider = 0;
static bool apoyo = false;     // la segunda bomba en marcha
static bool dormido = true;
static float presion = 0;
static bool presionOk = false;
static uint8_t ptSinRespuesta = 0;
static float integral = 0;
static float salidaPi = 0;
static uint32_t dormirMs = 0, apoyoOnMs = 0, apoyoOffMs = 0;
static uint16_t regs[4];
static uint16_t orden[2];
static uint8_t paso = LEER_PT;
static uint32_t ultimoCiclo = 0, ultimoLog = 0;
static char codigo[4] = "";

static void alarma(const char *c)
{
    if (strcmp(codigo, c) == 0) return;
    strncpy(codigo, c, 3);
    codigo[3] = 0;
    JWPLC_Display.setErrCode(codigo);
    if (c[0]) Serial.printf("ALARMA %s\n", c);
}

static bool enMarcha(const Bomba &b) { return (b.estado & 0b11) == 0b11; }

static void pedirModbus()
{
    if (JWPLC_ModbusRTU.masterBusy() || JWPLC_ModbusRTU.masterDone()) return;
    switch (paso)
    {
    case LEER_PT: JWPLC_ModbusRTU.requestReadInputRegisters(3, 0, 1, regs, 150); break;
    case LEER_VF1:
    case LEER_VF2: JWPLC_ModbusRTU.requestReadHoldingRegisters(bombas[paso - LEER_VF1].dir, 0x2100, 4, regs, 150); break;
    default:
    {
        Bomba &b = bombas[paso - ESCRIBIR_VF1];
        orden[0] = b.orden ? 0x12 : 0x01;  // marcha adelante / parada
        orden[1] = (uint16_t)(b.hz * 100);
        JWPLC_ModbusRTU.requestWriteMultipleRegisters(b.dir, 0x2000, 2, orden, 150);
    }
    }
}

static void recibirModbus()
{
    if (!JWPLC_ModbusRTU.masterDone()) return;
    const bool ok = JWPLC_ModbusRTU.masterSucceeded();
    if (paso == LEER_PT)
    {
        if (ok && regs[0] != 32767)
        {
            presion = regs[0] / 100.0f;
            presionOk = true;
            ptSinRespuesta = 0;
        }
        else if (!ok && ++ptSinRespuesta < 3)
        {
            // un error suelto se tolera
        }
        else presionOk = false;
    }
    else if (paso == LEER_VF1 || paso == LEER_VF2)
    {
        Bomba &b = bombas[paso - LEER_VF1];
        if (ok)
        {
            b.falla = regs[0];
            b.estado = regs[1];
            b.hzSalida = regs[3] / 100.0f;
            b.sinRespuesta = 0;
        }
        else if (b.sinRespuesta < 255) b.sinRespuesta++;
    }
    JWPLC_ModbusRTU.clearMasterResult();
    paso = (Paso)((paso + 1) % N_PASOS);
}

static void cambiarLider(const char *motivo)
{
    lider ^= 1;
    Serial.printf("Bomba líder: B%u (%s)\n", lider + 1, motivo);
}

static void controlar(uint32_t ahora, bool automatico, bool agua)
{
    const float dt = CICLO_MS / 1000.0f;

    // Variador en falla, sin respuesta o que no confirma la marcha: se bloquea.
    for (uint8_t i = 0; i < 2; i++)
    {
        Bomba &b = bombas[i];
        if (b.orden && !enMarcha(b)) b.sinConfirmarMs += CICLO_MS;
        else b.sinConfirmarMs = 0;
        if (!b.bloqueada && (b.falla != 0 || b.sinRespuesta >= 5 || b.sinConfirmarMs > 3000))
        {
            b.bloqueada = true;
            char c[4] = {'E', (char)('1' + i), (char)(b.falla ? 'F' : b.sinRespuesta >= 5 ? 'C' : 'M'), 0};
            alarma(c);
            Serial.printf("B%u bloqueada: %s\n", i + 1, b.falla ? "falla del variador" : b.sinRespuesta >= 5 ? "sin comunicación" : "no confirma marcha");
            if (i == lider) cambiarLider("falla de la líder");
        }
    }
    if (!automatico)
    {
        // Apagado: se reponen las bombas bloqueadas y la alarma.
        for (Bomba &b : bombas) b.bloqueada = false;
        alarma("");
    }

    const bool puede = automatico && agua && presionOk;
    if (!agua) alarma("E01");
    else if (automatico && !presionOk) alarma("E02");
    else if (codigo[0] == 'E' && (codigo[1] == '0') && puede) alarma("");

    Bomba &L = bombas[lider];
    Bomba &A = bombas[lider ^ 1];
    if (L.bloqueada && !A.bloqueada) cambiarLider("la líder está bloqueada");

    if (!puede || L.bloqueada)
    {
        dormido = true;
        apoyo = false;
        integral = 0;
    }
    else if (dormido)
    {
        if (presion < CONSIGNA - DESPERTAR)
        {
            dormido = false;
            integral = F_MIN + 10;
            Serial.printf("Despierta con %.2f bar\n", presion);
        }
    }
    else
    {
        // PI con anti-windup por recorte.
        const float e = CONSIGNA - presion;
        integral += KI * e * dt;
        if (integral > F_MAX) integral = F_MAX;
        if (integral < F_MIN) integral = F_MIN;
        salidaPi = KP * e + integral;
        if (salidaPi > F_MAX) salidaPi = F_MAX;
        if (salidaPi < F_MIN) salidaPi = F_MIN;

        // Segunda bomba: entra si la líder va a fondo y falta presión.
        if (!apoyo && !A.bloqueada && salidaPi >= F_MAX - 0.5 && e > 0.3)
        {
            if ((apoyoOnMs += CICLO_MS) > 5000)
            {
                apoyo = true;
                apoyoOnMs = 0;
                Serial.println("Entra la bomba de apoyo");
            }
        }
        else apoyoOnMs = 0;
        if (apoyo && salidaPi < 48)
        {
            if ((apoyoOffMs += CICLO_MS) > 5000)
            {
                apoyo = false;
                apoyoOffMs = 0;
                Serial.println("Sale la bomba de apoyo");
            }
        }
        else apoyoOffMs = 0;
        if (apoyo && A.bloqueada) apoyo = false;

        // A dormir: poco consumo (mínima frecuencia) y la presión en consigna.
        if (!apoyo && salidaPi <= F_MIN + 0.5 && presion >= CONSIGNA - 0.1)
        {
            if ((dormirMs += CICLO_MS) > 6000)
            {
                dormido = true;
                dormirMs = 0;
                Serial.printf("Duerme con %.2f bar\n", presion);
                cambiarLider("alternancia");
            }
        }
        else dormirMs = 0;
    }

    Bomba &L2 = bombas[lider];
    Bomba &A2 = bombas[lider ^ 1];
    L2.orden = !dormido;
    L2.hz = dormido ? 0 : salidaPi;
    A2.orden = !dormido && apoyo;
    A2.hz = A2.orden ? salidaPi : 0;

    digitalWrite(Q0_0, L2.orden || A2.orden);
    digitalWrite(Q0_1, codigo[0] != 0 && (ahora / 500) % 2);
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_DISABLED);
    JWPLC_Display.setErrCode("");
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1)) Serial.println("Modbus: begin falló");
    Serial.println("Bombeo de edificio a presión constante: consigna 4,0 bar");
}

void loop()
{
    JWPLC_ModbusRTU.task();
    recibirModbus();
    pedirModbus();

    const uint32_t ahora = millis();
    if (ahora - ultimoCiclo >= CICLO_MS)
    {
        ultimoCiclo = ahora;
        controlar(ahora, digitalRead(I0_1), digitalRead(I0_0));
    }
    if (ahora - ultimoLog >= 2000)
    {
        ultimoLog = ahora;
        Serial.printf("P=%.2f bar  B1 %s %.1f Hz  B2 %s %.1f Hz  %s\n", presion,
                      bombas[0].orden ? "ON " : "off", bombas[0].hzSalida,
                      bombas[1].orden ? "ON " : "off", bombas[1].hzSalida, dormido ? "durmiendo" : "regulando");
    }
}
