// Curso JWPLC Basic · Lección 34 · Escribir un registro: la consigna del horno
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el horno de la lección 33. Ahora el JWPLC no solo pregunta
// la temperatura: también CAMBIA la consigna del controlador, la
// temperatura a la que debe llegar. UP y DOWN la ajustan de a 5 °C y OK la
// envía por el bus.
//
// Mapa del controlador:
//   registro input 0     temperatura medida (PV) × 10, solo lectura
//   registro holding 0   consigna (SV) × 10, se lee (03) y se escribe (06)

const uint8_t CONTROLADOR = 1;
const int CONSIGNA_MIN = 20;
const int CONSIGNA_MAX = 90;
const int PASO = 5;

int consigna = 40;              // °C: la que se va a enviar
uint16_t registros[1];
unsigned long ultimaLectura = 0;

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();

    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }

    Serial.println("Lección 34: escribir la consigna, UP/DOWN cambian, OK envía");
    Serial.printf("Consigna: %d °C\n", consigna);
}

void loop()
{
    // ---- Ajuste local: todavía no se envía nada.
    if (JWPLC_Buttons.pressed(BTN_UP) && consigna + PASO <= CONSIGNA_MAX)
    {
        consigna = consigna + PASO;
        Serial.printf("Consigna: %d °C (OK para enviar)\n", consigna);
    }
    if (JWPLC_Buttons.pressed(BTN_DOWN) && consigna - PASO >= CONSIGNA_MIN)
    {
        consigna = consigna - PASO;
        Serial.printf("Consigna: %d °C (OK para enviar)\n", consigna);
    }

    // ---- OK: función 06, escribir un registro holding.
    if (JWPLC_Buttons.pressed(BTN_OK))
    {
        if (JWPLC_ModbusRTU.writeSingleRegisterSync(CONTROLADOR, 0, consigna * 10))
            Serial.printf("Consigna enviada: %d °C\n", consigna);
        else
        {
            Serial.print("No se pudo enviar: ");
            Serial.println(JWPLC_ModbusRTU.lastErrorString());
        }
    }

    // ---- Cada segundo, la temperatura (como en la lección 33).
    if (millis() - ultimaLectura >= 1000)
    {
        ultimaLectura = millis();
        if (JWPLC_ModbusRTU.readInputRegistersSync(CONTROLADOR, 0, 1, registros))
        {
            int16_t decimas = registros[0];
            Serial.printf("Temperatura: %.1f °C\n", decimas / 10.0);
        }
        else
        {
            Serial.print("Sin respuesta del controlador: ");
            Serial.println(JWPLC_ModbusRTU.lastErrorString());
        }
    }
}
