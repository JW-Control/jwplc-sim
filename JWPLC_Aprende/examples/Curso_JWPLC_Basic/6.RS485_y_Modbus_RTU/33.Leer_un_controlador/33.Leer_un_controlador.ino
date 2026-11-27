// Curso JWPLC Basic · Lección 33 · El bus RS-485: leer un controlador de temperatura
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un horno con su controlador de temperatura de panel. El
// controlador mide con su PT100 y prende la resistencia solo; el JWPLC le
// PREGUNTA la temperatura por el bus RS-485, con el protocolo Modbus RTU.
//
// En Modbus, el JWPLC es el MAESTRO: pregunta. El controlador es un
// ESCLAVO: responde solo cuando le preguntan, y solo si la pregunta lleva
// su dirección (aquí, la 1).
//
// Mapa del controlador (de su hoja de datos):
//   registro input 0   temperatura medida (PV) en décimas de °C: 253 = 25,3 °C
//   registro input 1   estado: bit 0 salida, bit 1 alarma, bit 2 sonda abierta

const uint8_t CONTROLADOR = 1;           // su dirección Modbus
const unsigned long CADA_MS = 1000;      // una pregunta por segundo

uint16_t registros[1];                   // aquí deja la respuesta
unsigned long ultimaLectura = 0;

void setup()
{
    Serial.begin(115200);

    // El JWPLC como maestro: 247 es su número interno; 9600 baudios, 8N1,
    // igual que el controlador. Si no coinciden, nadie se entiende.
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }

    Serial.println("Lección 33: Modbus RTU, controlador de temperatura en la dirección 1");
}

void loop()
{
    if (millis() - ultimaLectura < CADA_MS)
        return;
    ultimaLectura = millis();

    // Función 04: leer 1 registro input, desde el 0, del equipo 1.
    // Sync: espera la respuesta (unos milisegundos) antes de seguir.
    if (JWPLC_ModbusRTU.readInputRegistersSync(CONTROLADOR, 0, 1, registros))
    {
        // El registro llega como número sin signo; int16_t recupera las
        // temperaturas bajo cero. Dividir entre 10 da los grados.
        int16_t decimas = registros[0];
        float temperatura = decimas / 10.0;
        Serial.printf("Temperatura: %.1f °C\n", temperatura);
    }
    else
    {
        Serial.print("Sin respuesta del controlador: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
}
