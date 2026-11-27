// Curso JWPLC Basic · Lección 45 · Proyecto: presión constante en un edificio
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// El proyecto de la unidad: el equipo de presión constante de un edificio,
// como los que venden armados. Todo lo de la unidad junto:
//   - PT1 (dirección 2): la presión, escalada y validada (lección 40)
//   - VF1 (dirección 1): la bomba con variador, en rampa (lecciones 36 y 42)
//   - control PI con anti-windup (lección 44)
//   - reposo sin consumo y despertar por presión (práctica de la lección 44)
//   - H1 (Q0.0) bomba en marcha; H2 (Q0.1) alarma
//   - alarma de presión baja: bajo 2,0 bar durante 10 s con la bomba en
//     marcha (una tubería rota, la bomba sin agua)
//
// El loop() solo llama a las partes, en el orden de un PLC:
// medir → decidir → actuar → avisar.

const uint8_t VARIADOR = 1;
const uint8_t TRANSMISOR = 2;
const uint16_t MARCHA_ADELANTE = 0b00010010;
const uint16_t PARADA = 0b00000001;
const uint16_t SENSOR_ABIERTO = 32767;

const float CONSIGNA = 4.0;
const float DESPIERTA_BAJO = 3.5;
const float KP = 10.0;
const float KI = 4.0;
const float MIN_HZ = 20.0;
const float MAX_HZ = 60.0;
const unsigned long CICLO_MS = 500;
const float FIJA_SIN_SENSOR_HZ = 45.0;

enum Estado : uint8_t
{
    DETENIDO,
    REGULANDO,
    REPOSO
};

Estado estado = DETENIDO;
float presion = 0;
bool sensorBien = false;
float integral = MIN_HZ;
float frecuencia = 0;
bool presionBaja = false;
bool sinSensor = false;
unsigned long enMinimoDesde = 0;
unsigned long bajaDesde = 0;
uint16_t registros[1];
unsigned long ultimoCiclo = 0;
unsigned long ultimoAviso = 0;

void cambiarEstado(Estado nuevo, const char *aviso)
{
    estado = nuevo;
    integral = MIN_HZ;
    enMinimoDesde = millis();
    Serial.println(aviso);
}

void medir()
{
    bool leido = JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros);
    sensorBien = leido && registros[0] != SENSOR_ABIERTO;
    if (sensorBien)
        presion = registros[0] / 100.0;
}

void decidir()
{
    // Sin sensor: frecuencia fija y alarma, sin PI ni reposo.
    if (!sensorBien && !sinSensor && estado != DETENIDO)
    {
        sinSensor = true;
        Serial.println("Sensor de presión en falla: bomba a 45 Hz");
    }
    if (sensorBien && sinSensor)
    {
        sinSensor = false;
        integral = FIJA_SIN_SENSOR_HZ;
        Serial.println("Sensor de presión normal");
    }
    if (sinSensor)
    {
        estado = REGULANDO;
        frecuencia = FIJA_SIN_SENSOR_HZ;
        return;
    }

    if (estado == REPOSO && presion < DESPIERTA_BAJO)
        cambiarEstado(REGULANDO, "Bomba despierta");

    if (estado != REGULANDO)
    {
        frecuencia = 0;
        return;
    }

    float error = CONSIGNA - presion;
    float dt = CICLO_MS / 1000.0;
    integral = constrain(integral + KI * error * dt, MIN_HZ, MAX_HZ);
    frecuencia = constrain(KP * error + integral, MIN_HZ, MAX_HZ);

    if (frecuencia > MIN_HZ || presion < CONSIGNA - 0.1)
        enMinimoDesde = millis();
    if (millis() - enMinimoDesde >= 5000)
        cambiarEstado(REPOSO, "Bomba en reposo");

    // Presión baja con la bomba trabajando: algo anda mal.
    if (presion >= 2.0)
        bajaDesde = millis();
    if (!presionBaja && millis() - bajaDesde >= 10000)
    {
        presionBaja = true;
        Serial.println("Presión baja: revisar la bomba y la tubería");
    }
}

void actuar()
{
    if (estado == REGULANDO)
    {
        JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2001, frecuencia * 100);
        JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2000, MARCHA_ADELANTE);
    }
    else
        JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2000, PARADA);

    digitalWrite(Q0_0, estado == REGULANDO);
    digitalWrite(Q0_1, presionBaja || sinSensor);
}

void avisar()
{
    if (millis() - ultimoAviso < 2000)
        return;
    ultimoAviso = millis();
    if (estado == REGULANDO)
        Serial.printf("Presión: %.2f bar · %.1f Hz\n", presion, frecuencia);
}

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 45: presión constante 4,0 bar, marcha I0.0, parada NC I0.1");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    if (marcha && paradaSinApretar && estado == DETENIDO)
        cambiarEstado(REGULANDO, "Equipo en marcha");
    if (!paradaSinApretar && estado != DETENIDO)
    {
        cambiarEstado(DETENIDO, "Equipo detenido");
        presionBaja = false;
    }

    if (millis() - ultimoCiclo < CICLO_MS)
        return;
    ultimoCiclo = millis();

    medir();
    decidir();
    actuar();
    avisar();
}
