// Planta de tratamiento de agua · JWPLC Basic
//
// La bomba de captación M1 (KM1) pasa el agua cruda por el filtro de arena F1
// y la manda al reservorio T2 (válvula de servicio Y1). Cuando el presostato
// diferencial PDS marca el filtro colmatado, o cada cierto volumen, se hace un
// retrolavado (Y1 cerrada, Y2 al desagüe). La bomba dosificadora CL1 inyecta
// cloro en la línea; el analizador AT1 (RS-485 Modbus RTU, dirección 4, 9600
// 8N1, registro 0 = mg/L × 100) da el cloro residual y el PLC lo regula a
// 1,0 mg/L con un PI de tiempo proporcional (ventana de 10 s).
//   I0_0 LSL, flotador bajo del reservorio (cerrado = agua sobre el bajo)
//   I0_1 LSH, flotador alto (cerrado = reservorio lleno)
//   I0_2 PDS, presostato diferencial del filtro (cerrado = colmatado)
//   I0_3 S1, selector Automático
//   Q0_0 KM1, bomba de captación    Q0_3 CL1, bomba dosificadora
//   Q0_1 Y1, válvula de servicio     Q0_4 H1, ámbar: retrolavado
//   Q0_2 Y2, válvula de retrolavado  Q0_5 H2, rojo: alarma
// Alarmas: E10 cloro bajo, E11 cloro alto, E12 dosificadora sin efecto,
// E13 analizador sin respuesta o sin muestra (deja de dosificar).

static const float CONSIGNA = 1.0;       // mg/L
static const uint32_t VENTANA_MS = 10000;
static const uint32_t RETROLAVADO_MS = 25000;
static const uint32_t CONFIRMA_PDS_MS = 3000;

enum Estado : uint8_t { REPOSO, FILTRANDO, RETROLAVANDO };
static Estado estado = REPOSO;
static uint32_t desde = 0, pdsDesde = 0;
static bool pidiendo = false;           // el reservorio pide agua (histéresis LSL/LSH)
static float cloro = 0;
static bool cloroOk = false;
static uint8_t sinRespuesta = 0;
static uint16_t regs[2];
static uint32_t ultimaLectura = 0;
static float integral = 0.4, duty = 0;
static uint32_t inicioVentana = 0;
static uint32_t dosificandoMs = 0;
static float cloroAlEmpezar = 0;
static uint32_t ultimoLog = 0;
static char codigo[4] = "";

static void alarma(const char *c)
{
    if (strcmp(codigo, c) == 0) return;
    strncpy(codigo, c, 3);
    codigo[3] = 0;
    JWPLC_Display.setErrCode(codigo);
    if (c[0]) Serial.printf("ALARMA %s\n", c);
}

static void leerAnalizador(uint32_t ahora)
{
    JWPLC_ModbusRTU.task();
    if (JWPLC_ModbusRTU.masterDone())
    {
        if (JWPLC_ModbusRTU.masterSucceeded() && regs[0] != 32767)
        {
            cloro = regs[0] / 100.0f;
            cloroOk = true;
            sinRespuesta = 0;
        }
        else if (++sinRespuesta >= 3) cloroOk = false;
        JWPLC_ModbusRTU.clearMasterResult();
    }
    if (!JWPLC_ModbusRTU.masterBusy() && !JWPLC_ModbusRTU.masterDone() && ahora - ultimaLectura >= 1000)
    {
        ultimaLectura = ahora;
        JWPLC_ModbusRTU.requestReadInputRegisters(4, 0, 2, regs, 200);
    }
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_DISABLED);
    JWPLC_Display.setErrCode("");
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1)) Serial.println("Modbus: begin falló");
    Serial.println("Planta de tratamiento: cloro 1,0 mg/L");
}

void loop()
{
    const uint32_t ahora = millis();
    leerAnalizador(ahora);

    const bool bajo = digitalRead(I0_0);
    const bool lleno = digitalRead(I0_1);
    const bool colmatado = digitalRead(I0_2);
    const bool automatico = digitalRead(I0_3);

    if (!bajo) pidiendo = true;
    else if (lleno) pidiendo = false;

    switch (estado)
    {
    case REPOSO:
        if (automatico && pidiendo)
        {
            estado = FILTRANDO;
            desde = ahora;
            Serial.println("Filtrando hacia el reservorio");
        }
        break;
    case FILTRANDO:
        if (!automatico || !pidiendo)
        {
            estado = REPOSO;
            Serial.println(pidiendo ? "Apagado" : "Reservorio lleno");
            break;
        }
        // Presostato diferencial sostenido (el arranque de la bomba da picos).
        if (colmatado && ahora - desde > 2000)
        {
            if (!pdsDesde) pdsDesde = ahora;
            if (ahora - pdsDesde > CONFIRMA_PDS_MS)
            {
                estado = RETROLAVANDO;
                desde = ahora;
                pdsDesde = 0;
                Serial.println("Filtro colmatado: retrolavado");
            }
        }
        else pdsDesde = 0;
        break;
    case RETROLAVANDO:
        if (!automatico)
        {
            estado = REPOSO;
            break;
        }
        if (ahora - desde > RETROLAVADO_MS)
        {
            estado = pidiendo ? FILTRANDO : REPOSO;
            desde = ahora;
            Serial.println("Retrolavado terminado");
        }
        break;
    }

    // Cloración: solo con agua filtrada pasando y lectura válida.
    const bool hayCaudal = estado == FILTRANDO;
    bool dosifica = false;
    if (hayCaudal && cloroOk)
    {
        if (ahora - inicioVentana >= VENTANA_MS)
        {
            inicioVentana = ahora;
            const float e = CONSIGNA - cloro;
            integral += 0.05f * e;
            if (integral < 0) integral = 0;
            if (integral > 1) integral = 1;
            duty = 0.3f * e + integral;
            if (duty < 0) duty = 0;
            if (duty > 1) duty = 1;
        }
        dosifica = (ahora - inicioVentana) < (uint32_t)(duty * VENTANA_MS);
    }
    // Dosificadora sin efecto: dosificando con fuerza un minuto y el cloro no sube.
    if (hayCaudal && duty > 0.9f && cloroOk)
    {
        if (!dosificandoMs) { dosificandoMs = ahora; cloroAlEmpezar = cloro; }
        else if (ahora - dosificandoMs > 60000 && cloro < cloroAlEmpezar + 0.1f) alarma("E12");
    }
    else dosificandoMs = 0;

    if (automatico && !cloroOk && ahora > 5000) alarma("E13");
    else if (hayCaudal && ahora - desde > 60000 && cloro < 0.3f) alarma("E10");
    else if (cloroOk && cloro > 2.0f) alarma("E11");
    else if (codigo[0] && strcmp(codigo, "E12") != 0) alarma("");
    if (!automatico) alarma("");

    digitalWrite(Q0_0, estado != REPOSO);
    digitalWrite(Q0_1, estado == FILTRANDO);
    digitalWrite(Q0_2, estado == RETROLAVANDO);
    digitalWrite(Q0_3, dosifica);
    digitalWrite(Q0_4, estado == RETROLAVANDO && (ahora / 500) % 2);
    digitalWrite(Q0_5, codigo[0] != 0);

    if (ahora - ultimoLog >= 5000)
    {
        ultimoLog = ahora;
        Serial.printf("%s  cloro=%s%.2f mg/L  dosis=%d%%\n",
                      estado == FILTRANDO ? "filtrando" : estado == RETROLAVANDO ? "retrolavado" : "reposo",
                      cloroOk ? "" : "?", cloro, (int)(duty * 100));
    }
    delay(1);
}
