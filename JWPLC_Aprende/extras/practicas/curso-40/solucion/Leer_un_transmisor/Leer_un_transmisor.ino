// Curso JWPLC Basic · Lección 40 · Un transmisor: de un número a una presión
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la red de agua de un edificio. Un transmisor de presión de
// 0 a 10 bar en la tubería, con salida RS-485 (dirección 1), le dice al
// JWPLC cuánta presión hay.
//
// Una medida analógica llega como un NÚMERO. Para usarla hay que:
//   1. ESCALARLA: pasar el número a la unidad de la máquina.
//      Aquí el registro 0 trae bar × 100: 325 = 3,25 bar.
//   2. VALIDARLA: el transmisor avisa de su propia falla con un valor
//      imposible. Con el sensor abierto manda 32767.
//
// H1 (Q0.0) es la lámpara de alarma.

const uint8_t TRANSMISOR = 1;
const uint16_t SENSOR_ABIERTO = 32767;
const unsigned long CADA_MS = 500;

uint16_t registros[1];
float presion = 0;              // bar
bool sensorBien = true;
bool presionBaja = false;
unsigned long ultimaLectura = 0;
unsigned long ultimoAviso = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 40: transmisor de presión 0-10 bar en la dirección 1");
}

void loop()
{
    if (millis() - ultimaLectura < CADA_MS)
        return;
    ultimaLectura = millis();

    if (!JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros))
    {
        Serial.print("Sin respuesta del transmisor: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
        return;
    }

    // ---- Validar: 32767 no es una presión, es el aviso de falla.
    bool bienAntes = sensorBien;
    sensorBien = registros[0] != SENSOR_ABIERTO;
    if (!sensorBien && bienAntes)
        Serial.println("Sensor de presión abierto");
    if (sensorBien && !bienAntes)
        Serial.println("Sensor de presión normal");

    // ---- Escalar: centésimas de bar a bar.
    if (sensorBien)
        presion = registros[0] / 100.0;

    // Una línea por segundo basta para leerla.
    if (millis() - ultimoAviso >= 1000)
    {
        ultimoAviso = millis();
        if (sensorBien)
            Serial.printf("Presión: %.2f bar\n", presion);
    }

    // ---- Alarma de presión baja con histéresis: entra bajo 2,0 y sale sobre 2,5.
    if (sensorBien && !presionBaja && presion < 2.0)
    {
        presionBaja = true;
        Serial.println("Presión baja");
    }
    if (sensorBien && presionBaja && presion > 2.5)
    {
        presionBaja = false;
        Serial.println("Presión normal");
    }

    digitalWrite(Q0_0, !sensorBien);
    digitalWrite(Q0_1, presionBaja);
}
