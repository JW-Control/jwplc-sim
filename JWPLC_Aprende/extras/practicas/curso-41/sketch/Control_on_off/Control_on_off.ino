// Curso JWPLC Basic · Lección 41 · Control on-off: el hidroneumático
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el agua de un edificio con tanque hidroneumático. La bomba
// (contactor KM1 en Q0.0) llena el tanque de presión; los departamentos
// gastan y la presión baja.
//
// Control ON-OFF con histéresis, el de un presostato pero con el JWPLC:
//   presión < 3,0 bar   la bomba ARRANCA
//   presión ≥ 5,0 bar   la bomba PARA
//   entre los dos       sigue como estaba
// Sin el ancho entre los dos límites la bomba arrancaría y pararía varias
// veces por segundo, y el motor no lo aguanta.

const uint8_t TRANSMISOR = 1;
const uint16_t SENSOR_ABIERTO = 32767;
const float ARRANCA_BAJO = 3.0;
const float PARA_EN = 5.0;

uint16_t registros[1];
float presion = 0;
bool sensorBien = false;
bool bomba = false;
unsigned long ultimaLectura = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 41: control on-off, bomba KM1 en Q0.0, arranca < 3,0 bar, para en 5,0 bar");
}

void loop()
{
    if (millis() - ultimaLectura < 250)
        return;
    ultimaLectura = millis();

    // ---- Medir (lección 40).
    sensorBien = JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros) && registros[0] != SENSOR_ABIERTO;
    if (sensorBien)
        presion = registros[0] / 100.0;

    // ---- Decidir: la histéresis.
    bool antes = bomba;
    if (presion < ARRANCA_BAJO)
        bomba = true;
    if (presion >= PARA_EN)
        bomba = false;
    if (!sensorBien)
        bomba = false;          // sin medida, la bomba no trabaja a ciegas

    if (bomba != antes)
        Serial.printf("%s a %.2f bar\n", bomba ? "Bomba en marcha" : "Bomba parada", presion);

    digitalWrite(Q0_0, bomba);
}
