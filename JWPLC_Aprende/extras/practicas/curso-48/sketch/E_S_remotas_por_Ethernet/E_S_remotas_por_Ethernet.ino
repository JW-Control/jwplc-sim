// Curso JWPLC Basic · Lección 48 · E/S remotas por Ethernet: el JWPLC cliente Modbus TCP
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: la bomba de la lección 35, pero el módulo de E/S remotas
// llega por la red Ethernet y no por el RS-485. Ahora el JWPLC es el
// CLIENTE: se conecta al módulo (192.168.250.20, puerto 502) y le pregunta.
//
//   DI1  S1, marcha (NA)        DO1  KM1, contactor de la bomba
//   DI2  S2, parada (NC)        DO2  H1, lámpara de marcha
//
// En Modbus TCP la pregunta no bloquea el programa: se PIDE, el JWPLC sigue
// con su loop() y, cuando llega la respuesta, done() avisa. Por eso el ciclo
// va en dos pasos: leer las entradas y después escribir las salidas.

#include <JWPLC_ModbusTCP.h>

IPAddress MODULO(192, 168, 250, 20);
const unsigned long CICLO_MS = 100;

enum Paso { LEER, ESCRIBIR };
Paso paso = LEER;

uint8_t entradas[1];          // DI1..DI8 en un byte
uint8_t salidas[1];           // DO1..DO8 en un byte
bool bomba = false;
bool enLinea = false;
unsigned long ultimoCiclo = 0;

void setup()
{
    Serial.begin(115200);
    JWPLC_ModbusTCPClient.begin(MODULO, 1, 502);
    Serial.println("Lección 48: E/S remotas por Ethernet en 192.168.250.20, bomba en DO1");
}

void loop()
{
    JWPLC_ModbusTCPClient.task();          // atiende la conversación con el módulo

    // ---- Llegó la respuesta del paso en curso.
    if (JWPLC_ModbusTCPClient.done())
    {
        bool bien = JWPLC_ModbusTCPClient.succeeded();
        if (bien != enLinea)
        {
            if (bien)
                Serial.println("Módulo en línea");
            else
            {
                Serial.print("Sin respuesta del módulo: ");
                Serial.println(JWPLC_ModbusTCPClient.resultString());
            }
            enLinea = bien;
        }
        if (bien && paso == LEER)
        {
            // ---- Decidir: el enclavamiento de siempre.
            bool marcha = (entradas[0] & 0b00000001) != 0;              // DI1
            bool paradaSinApretar = (entradas[0] & 0b00000010) != 0;    // DI2, NC
            bool bombaAntes = bomba;
            bomba = (marcha || bomba) && paradaSinApretar;
            if (bomba != bombaAntes)
                Serial.println(bomba ? "Bomba en marcha" : "Bomba detenida");
            paso = ESCRIBIR;
        }
        else
            paso = LEER;
        JWPLC_ModbusTCPClient.clearResult();
    }

    if (JWPLC_ModbusTCPClient.busy())
        return;

    // ---- Pedir el paso que toca.
    if (paso == ESCRIBIR)
    {
        salidas[0] = 0;
        if (bomba)
            salidas[0] = salidas[0] | 0b00000011;   // DO1 contactor y DO2 lámpara
        JWPLC_ModbusTCPClient.requestWriteMultipleCoils(0, 8, salidas);
    }
    else if (millis() - ultimoCiclo >= CICLO_MS)
    {
        ultimoCiclo = millis();
        JWPLC_ModbusTCPClient.requestReadDiscreteInputs(0, 8, entradas);
    }
}
