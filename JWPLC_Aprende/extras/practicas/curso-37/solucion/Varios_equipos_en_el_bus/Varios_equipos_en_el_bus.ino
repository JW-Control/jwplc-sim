// Curso JWPLC Basic · Lección 37 · Varios equipos en el bus: un horno con ventilación
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el horno de la lección 33 con un ventilador de extracción.
// En el MISMO par de hilos hay dos esclavos, cada uno con su dirección:
//   dirección 1   TC1, controlador de temperatura
//   dirección 3   IO1, módulo de E/S remotas: DO1 = contactor del ventilador
// El maestro les pregunta por turno. Si los dos tuvieran la misma
// dirección, responderían a la vez y nadie entendería nada.
//
// El ventilador: arranca a 45 °C y para a 40 °C (histéresis, lección 27).

const uint8_t CONTROLADOR = 1;
const uint8_t MODULO = 3;
const float VENTILA_DESDE = 45.0;
const float VENTILA_HASTA = 40.0;
const unsigned long CICLO_MS = 500;

uint16_t registros[2];        // del controlador: temperatura y estado
uint8_t salidas[1];           // al módulo: DO1..DO8
uint8_t entradas[1];          // del módulo: DI1..DI8
bool puertaAntes = false;
bool ventilador = false;
unsigned long ultimoCiclo = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 37: dos equipos en el bus, TC1 dirección 1, IO1 dirección 3");
}

void loop()
{
    if (millis() - ultimoCiclo < CICLO_MS)
        return;
    ultimoCiclo = millis();

    // ---- Turno del controlador (dirección 1).
    if (!JWPLC_ModbusRTU.readInputRegistersSync(CONTROLADOR, 0, 2, registros))
    {
        Serial.println("TC1 no responde");
        return;
    }
    int16_t decimas = registros[0];
    float temperatura = decimas / 10.0;

    bool alarma = (registros[1] & 2) != 0;

    // ---- Turno del módulo: la puerta del horno en DI1.
    if (!JWPLC_ModbusRTU.readDiscreteInputsSync(MODULO, 0, 8, entradas))
    {
        Serial.println("IO1 no responde");
        return;
    }
    bool puertaAbierta = (entradas[0] & 0b00000001) != 0;
    if (puertaAbierta && !puertaAntes)
        Serial.println("Puerta abierta");
    puertaAntes = puertaAbierta;

    // ---- Decidir: histéresis del ventilador.
    bool antes = ventilador;
    if (temperatura >= VENTILA_DESDE)
        ventilador = true;
    if (temperatura <= VENTILA_HASTA)
        ventilador = false;
    if (puertaAbierta)
        ventilador = false;     // con la puerta abierta no se extrae
    if (ventilador != antes)
        Serial.printf("%s a %.1f °C\n", ventilador ? "Ventilador encendido" : "Ventilador apagado", temperatura);

    // ---- Turno del módulo (dirección 3): las salidas.
    salidas[0] = 0;
    if (ventilador)
        salidas[0] = salidas[0] | 0b00000001;   // DO1 ventilador
    if (alarma)
        salidas[0] = salidas[0] | 0b00000010;   // DO2 lámpara de alarma
    if (!JWPLC_ModbusRTU.writeMultipleCoilsSync(MODULO, 0, 8, salidas))
        Serial.println("IO1 no responde");
}
