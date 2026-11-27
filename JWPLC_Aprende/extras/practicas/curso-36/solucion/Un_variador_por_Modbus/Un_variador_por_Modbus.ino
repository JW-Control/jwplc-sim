// Curso JWPLC Basic · Lección 36 · Un variador por Modbus: marcha y velocidad
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un ventilador con variador de frecuencia. Sin bus harían
// falta un cable por orden (marcha, sentido) y una señal analógica para la
// velocidad. Con Modbus, el JWPLC escribe la orden y la frecuencia en
// registros del variador por los mismos dos hilos.
//
// Registros del variador (de su manual; van en hexadecimal):
//   2000H  orden: bits 1-0 = 10 marcha, 01 parada; bits 5-4 = 01 adelante
//   2001H  frecuencia pedida × 100 (3000 = 30,00 Hz)
//   2103H  frecuencia de salida × 100 (la que tiene el motor ahora)
// El variador está programado para Modbus (02.00 = 3, 02.01 = 3), dirección
// 1, 9600 bps, RTU 8N1.

const uint8_t VARIADOR = 1;
const uint16_t REG_ORDEN = 0x2000;
const uint16_t REG_FRECUENCIA = 0x2001;
const uint16_t REG_SALIDA = 0x2103;
const uint16_t MARCHA_ADELANTE = 0b00010010;
const uint16_t PARADA = 0b00000001;

int velocidad = 30;                 // Hz
const int VEL_MIN = 10;
const int VEL_MAX = 60;
const int PASO = 10;
bool ventilador = false;
uint16_t registros[1];
unsigned long ultimaLectura = 0;

void enviarOrden(uint16_t orden)
{
    if (!JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_ORDEN, orden))
    {
        Serial.print("El variador no responde: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
}

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 36: variador por Modbus, marcha I0.0, parada NC I0.1");
    JWPLC_Buttons.clearPendingInput();
}

// Cambia la velocidad dentro de los límites y la envía al variador.
void cambiarVelocidad(int paso)
{
    int nueva = velocidad + paso;
    if (nueva < VEL_MIN || nueva > VEL_MAX)
        return;
    velocidad = nueva;
    JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_FRECUENCIA, velocidad * 100);
    Serial.printf("Velocidad: %d Hz\n", velocidad);
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;

    // ---- Marcha: primero la frecuencia, después la orden.
    if (marcha && !ventilador && paradaSinApretar)
    {
        ventilador = true;
        JWPLC_ModbusRTU.writeSingleRegisterSync(VARIADOR, REG_FRECUENCIA, velocidad * 100);
        enviarOrden(MARCHA_ADELANTE);
        Serial.printf("Ventilador en marcha a %d Hz\n", velocidad);
    }
    if (ventilador && !paradaSinApretar)
    {
        ventilador = false;
        enviarOrden(PARADA);
        Serial.println("Ventilador detenido");
    }

    // ---- La botonera cambia la velocidad, en marcha o detenido.
    if (JWPLC_Buttons.pressed(BTN_UP))
        cambiarVelocidad(PASO);
    if (JWPLC_Buttons.pressed(BTN_DOWN))
        cambiarVelocidad(-PASO);

    // ---- Cada segundo: la frecuencia real del motor (sube con la rampa).
    if (millis() - ultimaLectura >= 1000)
    {
        ultimaLectura = millis();
        if (JWPLC_ModbusRTU.readHoldingRegistersSync(VARIADOR, REG_SALIDA, 1, registros))
            Serial.printf("Frecuencia: %.1f Hz\n", registros[0] / 100.0);
    }
}
