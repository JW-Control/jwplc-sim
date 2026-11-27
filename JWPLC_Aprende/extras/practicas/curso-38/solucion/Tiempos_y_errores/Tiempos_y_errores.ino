// Curso JWPLC Basic · Lección 38 · Tiempos y errores: cuando un equipo no responde
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el horno, pero ahora el JWPLC hace el control: lee la
// temperatura del controlador por el bus y prende la resistencia (KM1,
// Q0.0) bajo 38 °C y la apaga en 40 °C.
//
// Hasta ahora cada pregunta usaba la versión Sync: el loop() se queda
// esperando la respuesta. Si el cable se corta, espera el tiempo máximo
// (timeout) en cada pregunta y la máquina entera se pone lenta.
//
// Aquí se usa la versión cooperativa, la de un PLC de verdad:
//   requestRead...()   lanza la pregunta y vuelve enseguida
//   task()             en cada vuelta, atiende el bus
//   masterDone()       ¿ya terminó? masterSucceeded(): ¿salió bien?
//   clearMasterResult() libera el resultado para la pregunta siguiente

const uint8_t CONTROLADOR = 1;
const unsigned long CADA_MS = 500;      // una pregunta cada medio segundo
const unsigned long TIMEOUT_MS = 300;   // si no responde en 300 ms, falló

uint16_t registros[1];
float temperatura = 0;
bool resistencia = false;
int fallasSeguidas = 0;
const int FALLAS_MAX = 3;          // tres seguidas: el equipo se perdió
bool sinComunicacion = false;
unsigned long ultimaPregunta = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 38: control por el bus, resistencia Q0.0, alarma Q0.1");
}

void loop()
{
    // ---- El bus avanza un paso en cada vuelta, sin detener el resto.
    JWPLC_ModbusRTU.task();

    // ---- ¿Llegó la respuesta (o venció el tiempo)?
    if (JWPLC_ModbusRTU.masterDone())
    {
        if (JWPLC_ModbusRTU.masterSucceeded())
        {
            int16_t decimas = registros[0];
            temperatura = decimas / 10.0;
            fallasSeguidas = 0;
            if (sinComunicacion)
            {
                sinComunicacion = false;
                Serial.println("Comunicación recuperada");
            }
        }
        else
        {
            fallasSeguidas = fallasSeguidas + 1;
            Serial.printf("TC1 no responde (%d): %s\n", fallasSeguidas, JWPLC_ModbusRTU.lastErrorString());
            if (fallasSeguidas >= FALLAS_MAX && !sinComunicacion)
            {
                sinComunicacion = true;
                Serial.println("Falla de comunicación con TC1");
            }
        }
        JWPLC_ModbusRTU.clearMasterResult();
    }

    // ---- ¿Toca preguntar? Solo si el bus está libre.
    if (!JWPLC_ModbusRTU.masterBusy() && !JWPLC_ModbusRTU.masterDone() && millis() - ultimaPregunta >= CADA_MS)
    {
        ultimaPregunta = millis();
        JWPLC_ModbusRTU.requestReadInputRegisters(CONTROLADOR, 0, 1, registros, TIMEOUT_MS);
    }

    // ---- El control, con la última temperatura conocida.
    bool antes = resistencia;
    if (temperatura < 38.0)
        resistencia = true;
    if (temperatura >= 40.0)
        resistencia = false;
    // Falla segura: sin saber la temperatura, la resistencia no queda prendida.
    if (sinComunicacion)
        resistencia = false;
    if (resistencia != antes)
        Serial.printf("Resistencia %s a %.1f °C\n", resistencia ? "encendida" : "apagada", temperatura);

    digitalWrite(Q0_0, resistencia);
    digitalWrite(Q0_1, sinComunicacion);   // H1: alarma de comunicación
}
