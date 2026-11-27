// Curso JWPLC Basic · Lección 35 · El módulo de E/S remotas: 8 entradas y 8 salidas más
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una bomba lejos del tablero. Junto a ella hay un módulo de
// E/S remotas en la dirección 3 del bus: los pulsadores de marcha y parada
// van a SUS entradas y el contactor y la lámpara a SUS salidas. Entre el
// tablero y la bomba solo corre el cable del bus, dos hilos.
//
// Mapa del módulo:
//   entradas discretas 0-7   DI1-DI8   (función 02, leer)
//   bobinas 0-7              DO1-DO8   (función 15, escribir varias)
// Los 8 bits van juntos en un byte: el bit 0 es DI1 (o DO1), el bit 7 DI8.
//
//   DI1  S1, marcha (NA)        DO1  KM1, contactor de la bomba
//   DI2  S2, parada (NC)        DO2  H1, lámpara de marcha

const uint8_t MODULO = 3;
const unsigned long CICLO_MS = 100;     // leer, decidir y escribir, 10 veces por segundo

uint8_t entradas[1];                     // DI1..DI8 en un byte
uint8_t salidas[1];                      // DO1..DO8 en un byte
bool bomba = false;
bool falla = false;
unsigned long ultimoCiclo = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("No arranca el Modbus: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    Serial.println("Lección 35: E/S remotas en la dirección 3, bomba en DO1");
}

void loop()
{
    if (millis() - ultimoCiclo < CICLO_MS)
        return;
    ultimoCiclo = millis();

    // ---- Leer: las 8 entradas del módulo en una pregunta.
    if (!JWPLC_ModbusRTU.readDiscreteInputsSync(MODULO, 0, 8, entradas))
    {
        Serial.print("Sin respuesta del módulo: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
        return;
    }
    bool marcha = (entradas[0] & 0b00000001) != 0;              // DI1
    bool paradaSinApretar = (entradas[0] & 0b00000010) != 0;    // DI2, NC
    bool termicoNormal = (entradas[0] & 0b00000100) != 0;       // DI3, NC

    // El térmico: falla en el flanco, una vez.
    bool fallaAntes = falla;
    falla = !termicoNormal;
    if (falla && !fallaAntes)
        Serial.println("Falla: térmico");

    // ---- Decidir: el enclavamiento de siempre (lección 08).
    bool bombaAntes = bomba;
    bomba = (marcha || bomba) && paradaSinApretar && !falla;
    if (bomba != bombaAntes)
        Serial.println(bomba ? "Bomba en marcha" : "Bomba detenida");

    // ---- Escribir: las 8 salidas del módulo en una orden.
    salidas[0] = 0;
    if (bomba)
        salidas[0] = salidas[0] | 0b00000011;   // DO1 contactor y DO2 lámpara
    if (falla)
        salidas[0] = salidas[0] | 0b00000100;   // DO3 lámpara de falla
    JWPLC_ModbusRTU.writeMultipleCoilsSync(MODULO, 0, 8, salidas);
}
