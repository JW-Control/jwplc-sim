// Curso JWPLC Basic · Lección 42 · Rampas: llegar a la velocidad de a poco
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una bomba con variador (lección 36). Un golpe de 0 a 50 Hz
// en un instante es un golpe de ariete en la tubería y un pico de
// corriente en el motor. Una RAMPA lleva el valor de a poco hacia su
// objetivo: aquí, 5 Hz por segundo.
//
// La rampa es un paso pequeño en cada vuelta:
//   si falta subir, sube un paso (sin pasarse)
//   si falta bajar, baja un paso (sin pasarse)
// Sirve para cualquier consigna: frecuencia, temperatura, presión.

const uint8_t VARIADOR = 1;
const uint16_t REG_ORDEN = 0x2000;
const uint16_t REG_FRECUENCIA = 0x2001;
const uint16_t MARCHA_ADELANTE = 0b00010010;
const uint16_t PARADA = 0b00000001;

const float OBJETIVO_HZ = 50.0;
const float HZ_POR_SEGUNDO = 5.0;
const float BAJADA_HZ_POR_SEGUNDO = 10.0;
const unsigned long CICLO_MS = 200;

float objetivo = 0;     // a dónde va
float actual = 0;       // dónde está la rampa ahora
bool enMarcha = false;
bool parando = false;
unsigned long ultimoCiclo = 0;
int ultimoAviso = 0;      // la última decena avisada

// Un paso de la rampa: acerca "actual" a "objetivo" sin pasarse.
void pasoDeRampa()
{
    float paso = HZ_POR_SEGUNDO * CICLO_MS / 1000.0;
    if (actual < objetivo)
        actual = min(actual + paso, objetivo);
    float pasoBajada = BAJADA_HZ_POR_SEGUNDO * CICLO_MS / 1000.0;
    if (actual > objetivo)
        actual = max(actual - pasoBajada, objetivo);
}

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 42: rampa de 5 Hz/s, marcha I0.0, parada NC I0.1");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;

    if (marcha && paradaSinApretar && !enMarcha && !parando)
    {
        enMarcha = true;
        objetivo = OBJETIVO_HZ;
        Serial.println("Marcha: rampa hacia 50 Hz");
    }
    if (!paradaSinApretar && enMarcha && !parando)
    {
        parando = true;
        objetivo = 0;
        Serial.println("Parada: rampa hacia 0 Hz");
    }

    if (millis() - ultimoCiclo < CICLO_MS)
        return;
    ultimoCiclo = millis();

    if (!enMarcha)
        return;

    // ---- La rampa y su escritura al variador, en cada ciclo.
    pasoDeRampa();
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_FRECUENCIA, actual * 100);
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_ORDEN, MARCHA_ADELANTE);

    // Al llegar a 0 en la bajada, recién la orden de parada.
    if (parando && actual <= 0)
    {
        parando = false;
        enMarcha = false;
        JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_ORDEN, PARADA);
        Serial.println("Detenido en rampa");
        return;
    }

    // Un aviso cada 10 Hz.
    int decena = (int)actual / 10;
    if (decena != ultimoAviso)
    {
        ultimoAviso = decena;
        Serial.printf("Rampa: %.0f Hz\n", actual);
    }
}
