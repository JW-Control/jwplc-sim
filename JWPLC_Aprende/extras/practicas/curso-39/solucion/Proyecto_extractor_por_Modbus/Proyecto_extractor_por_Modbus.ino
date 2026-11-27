// Curso JWPLC Basic · Lección 39 · Proyecto: el extractor de un horno, todo por Modbus
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el extractor de aire de un horno industrial. Tres equipos en
// el mismo bus, y el JWPLC como maestro:
//   dirección 1   VF1, variador del motor del extractor
//   dirección 2   TC1, controlador de temperatura del horno
//   dirección 3   IO1, E/S remotas: DI1 selector «Automático», DO1 lámpara
//                 de marcha
//
// La velocidad sigue a la temperatura:
//   menos de 40 °C   extractor parado
//   40 a 50 °C       30 Hz
//   50 °C o más      60 Hz
//
// El bus se recorre por TURNOS, como un semáforo (lección 11): en cada turno
// se lanza una pregunta, se espera su resultado sin detener el loop() y se
// pasa al turno siguiente. El variador para solo si pasa 3 s sin noticias
// del maestro: por eso se le escribe en todas las vueltas del ciclo.

enum Turno : uint8_t
{
    LEER_TEMPERATURA,
    LEER_ENTRADAS,
    ESCRIBIR_FRECUENCIA,
    ESCRIBIR_ORDEN,
    ESCRIBIR_SALIDAS
};

const uint8_t VARIADOR = 1;
const uint8_t CONTROLADOR = 2;
const uint8_t MODULO = 3;
const uint16_t MARCHA_ADELANTE = 0b00010010;
const uint16_t PARADA = 0b00000001;
const unsigned long TIMEOUT_MS = 200;

Turno turno = LEER_TEMPERATURA;
bool preguntando = false;

uint16_t temperaturaReg[1];
uint8_t entradas[1];
uint8_t salidas[1];

float temperatura = 0;
bool automatico = false;
int velocidad = 0;          // Hz pedidos; 0 = parado
int velocidadAntes = -1;
int fallasTemperatura = 0;
bool sinTemperatura = false;

// Lanza la pregunta del turno actual. Devuelve false si el bus no la aceptó.
bool preguntar()
{
    switch (turno)
    {
    case LEER_TEMPERATURA:
        return JWPLC_ModbusRTU.requestReadInputRegisters(CONTROLADOR, 0, 1, temperaturaReg, TIMEOUT_MS);
    case LEER_ENTRADAS:
        return JWPLC_ModbusRTU.requestReadDiscreteInputs(MODULO, 0, 8, entradas, TIMEOUT_MS);
    case ESCRIBIR_FRECUENCIA:
        return JWPLC_ModbusRTU.requestWriteSingleRegister(VARIADOR, 0x2001, velocidad * 100, TIMEOUT_MS);
    case ESCRIBIR_ORDEN:
        return JWPLC_ModbusRTU.requestWriteSingleRegister(VARIADOR, 0x2000, velocidad > 0 ? MARCHA_ADELANTE : PARADA, TIMEOUT_MS);
    case ESCRIBIR_SALIDAS:
        salidas[0] = velocidad > 0 ? 0b00000001 : 0;     // DO1: marcha
        if (sinTemperatura)
            salidas[0] = salidas[0] | 0b00000010;        // DO2: alarma
        return JWPLC_ModbusRTU.requestWriteMultipleCoils(MODULO, 0, 8, salidas, TIMEOUT_MS);
    }
    return false;
}


// Usa la respuesta del turno actual (si salió bien).
void usarRespuesta(bool bien)
{
    if (turno == LEER_TEMPERATURA && bien)
    {
        int16_t decimas = temperaturaReg[0];
        temperatura = decimas / 10.0;
        fallasTemperatura = 0;
        if (sinTemperatura)
        {
            sinTemperatura = false;
            Serial.println("Temperatura recuperada");
        }
    }
    if (turno == LEER_TEMPERATURA && !bien)
    {
        fallasTemperatura = fallasTemperatura + 1;
        if (fallasTemperatura >= 3 && !sinTemperatura)
        {
            sinTemperatura = true;
            Serial.println("Sin temperatura: extractor al máximo");
        }
    }
    if (turno == LEER_ENTRADAS && bien)
        automatico = (entradas[0] & 0b00000001) != 0;
    if (!bien)
        Serial.printf("Turno %d sin respuesta: %s\n", turno, JWPLC_ModbusRTU.lastErrorString());
}

void decidirVelocidad()
{
    // Falla segura de un extractor: sin saber la temperatura, ventilar al máximo.
    if (automatico && sinTemperatura)
        velocidad = 60;
    else if (!automatico || temperatura < 40.0)
        velocidad = 0;
    else if (temperatura < 50.0)
        velocidad = 30;
    else
        velocidad = 60;

    if (velocidad != velocidadAntes)
    {
        Serial.printf("Extractor: %d Hz (%.1f °C)\n", velocidad, temperatura);
        velocidadAntes = velocidad;
    }
}

// Después de leer las entradas se decide; luego, el turno siguiente.
void siguienteTurno()
{
    if (turno == LEER_ENTRADAS)
        decidirVelocidad();
    turno = (Turno)((turno + 1) % 5);
}

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 39: extractor por Modbus, VF1 dir. 1, TC1 dir. 2, IO1 dir. 3");
}

void loop()
{
    JWPLC_ModbusRTU.task();

    if (!preguntando)
    {
        preguntando = preguntar();
        if (!preguntando)
        {
            usarRespuesta(false);     // no se pudo ni preguntar
            siguienteTurno();
        }
    }
    else if (JWPLC_ModbusRTU.masterDone())
    {
        usarRespuesta(JWPLC_ModbusRTU.masterSucceeded());
        JWPLC_ModbusRTU.clearMasterResult();
        preguntando = false;
        siguienteTurno();
    }
}
