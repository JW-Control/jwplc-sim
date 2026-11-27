// Curso JWPLC Basic · Lección 44 · Control PI: sin error de régimen
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la de la lección 43, el agua del edificio con variador y
// transmisor. El control P se quedaba corto; el PI llega a la consigna.
//
// Control PI (proporcional + integral):
//   error     = consigna - presión
//   integral  = integral + KI × error × dt    (va SUMANDO el error en el tiempo)
//   frecuencia = KP × error + integral
// Mientras quede error, la integral sigue creciendo y empuja. Cuando la
// presión llega, el error es 0 y la integral se queda en la frecuencia que
// hacía falta: ahí está el «base» que en la lección 43 había que adivinar.
//
// ANTI-WINDUP: la integral se limita a MIN_HZ…MAX_HZ. Si no, al arrancar
// (error grande durante segundos) crecería sin fin y la presión se pasaría
// mucho antes de que la integral vuelva a bajar.
//
// La D de PID (derivativa) frena según qué tan rápido cambia el error; en
// presión de agua casi nunca se usa.

const uint8_t VARIADOR = 1;
const uint8_t TRANSMISOR = 2;
const uint16_t MARCHA_ADELANTE = 0b00010010;
const uint16_t PARADA = 0b00000001;
const uint16_t SENSOR_ABIERTO = 32767;

const float KP = 10.0;              // Hz por bar de error
const float KI = 4.0;               // Hz por bar de error, por segundo
const float MIN_HZ = 20.0;
const float MAX_HZ = 60.0;
const unsigned long CICLO_MS = 500;

float consigna = 4.0;
float presion = 0;
float integral = MIN_HZ;
float frecuencia = 0;
bool enMarcha = false;
uint16_t registros[1];
unsigned long ultimoCiclo = 0;
unsigned long ultimoAviso = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 44: control PI de presión, consigna 4,0 bar, marcha I0.0, parada NC I0.1");
}

// Un paso del PI: devuelve la frecuencia para este ciclo.
float pasoPI(float error)
{
    float dt = CICLO_MS / 1000.0;
    integral = constrain(integral + KI * error * dt, MIN_HZ, MAX_HZ);
    return constrain(KP * error + integral, MIN_HZ, MAX_HZ);
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    if (marcha && paradaSinApretar && !enMarcha)
    {
        enMarcha = true;
        integral = MIN_HZ;
        Serial.println("Control en marcha");
    }
    if (!paradaSinApretar && enMarcha)
    {
        enMarcha = false;
        JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2000, PARADA);
        Serial.println("Control detenido");
    }

    if (millis() - ultimoCiclo < CICLO_MS)
        return;
    ultimoCiclo = millis();

    if (!JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros) || registros[0] == SENSOR_ABIERTO)
        return;
    presion = registros[0] / 100.0;

    if (!enMarcha)
        return;

    frecuencia = pasoPI(consigna - presion);
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2001, frecuencia * 100);
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2000, MARCHA_ADELANTE);

    if (millis() - ultimoAviso >= 2000)
    {
        ultimoAviso = millis();
        Serial.printf("Presión: %.2f bar · %.1f Hz\n", presion, frecuencia);
    }
}
