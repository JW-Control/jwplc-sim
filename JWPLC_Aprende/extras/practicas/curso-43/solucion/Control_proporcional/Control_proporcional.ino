// Curso JWPLC Basic · Lección 43 · Control proporcional: presión constante
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el agua del edificio, ahora con variador (VF1, dirección 1)
// y el transmisor de presión (PT1, dirección 2). En vez de arrancar y
// parar (lección 41), la bomba gira MÁS O MENOS RÁPIDO para sostener la
// presión en la CONSIGNA: 4,0 bar.
//
// Control PROPORCIONAL (P):
//   error      = consigna - presión          (cuánto falta)
//   frecuencia = base + KP × error           (más falta, más rápido)
// Con KP = 20, si faltan 0,5 bar la bomba va 10 Hz por encima de la base.
//
// Mira la consola: la presión se queda ABAJO de la consigna. Al control P
// le hace falta un error para empujar; ese resto se llama error de régimen.

const uint8_t VARIADOR = 1;
const uint8_t TRANSMISOR = 2;
const uint16_t MARCHA_ADELANTE = 0b00010010;
const uint16_t PARADA = 0b00000001;
const uint16_t SENSOR_ABIERTO = 32767;

const float BASE_HZ = 40.0;
const float KP = 20.0;              // Hz por cada bar de error
const float MIN_HZ = 20.0;
const float MAX_HZ = 60.0;
const unsigned long CICLO_MS = 500;

float consigna = 4.0;               // bar
float presion = 0;
float frecuencia = 0;
bool enMarcha = false;
uint16_t registros[1];
unsigned long ultimoCiclo = 0;
unsigned long ultimoAviso = 0;

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 43: control P de presión, consigna 4,0 bar, marcha I0.0, parada NC I0.1");
}

void loop()
{
    // ---- La consigna desde la botonera.
    if (JWPLC_Buttons.pressed(BTN_UP) && consigna + 0.5 <= 6.0)
    {
        consigna = consigna + 0.5;
        Serial.printf("Consigna: %.1f bar\n", consigna);
    }
    if (JWPLC_Buttons.pressed(BTN_DOWN) && consigna - 0.5 >= 3.0)
    {
        consigna = consigna - 0.5;
        Serial.printf("Consigna: %.1f bar\n", consigna);
    }

    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    if (marcha && paradaSinApretar && !enMarcha)
    {
        enMarcha = true;
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

    // ---- Medir.
    if (!JWPLC_ModbusRTU.readInputRegistersSync(TRANSMISOR, 0, 1, registros) || registros[0] == SENSOR_ABIERTO)
        return;
    presion = registros[0] / 100.0;

    if (!enMarcha)
        return;

    // ---- Calcular: proporcional al error, dentro de los límites.
    float error = consigna - presion;
    frecuencia = BASE_HZ + KP * error;
    frecuencia = constrain(frecuencia, MIN_HZ, MAX_HZ);

    // ---- Actuar: en cada ciclo (el variador para si deja de oír al maestro).
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2001, frecuencia * 100);
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, 0x2000, MARCHA_ADELANTE);

    if (millis() - ultimoAviso >= 2000)
    {
        ultimoAviso = millis();
        Serial.printf("Presión: %.2f bar · %.1f Hz\n", presion, frecuencia);
    }
}
