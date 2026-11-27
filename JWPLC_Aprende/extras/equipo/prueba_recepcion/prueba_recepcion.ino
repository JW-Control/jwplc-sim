// JWPLC Basic · Prueba de recepción del equipo (Mi JWPLC ▸ Primer arranque)
//
// 1. Barrido de salidas: Q0.0 a Q0.7 se encienden de a una, dos vueltas.
//    Hay que escuchar cada relé y ver su LED.
// 2. Prueba de entradas: cada entrada I0.x enciende su salida Q0.x mientras
//    esté activa. Cuando las 8 entradas se vieron encendidas al menos una
//    vez, el Monitor Serie dice «PRUEBA COMPLETA».
// Si las E/S no arrancan (falla del TCA6424A), la pantalla muestra ERR «IO».

const uint32_t PASO_MS = 400;
uint8_t vistas = 0;           // entradas que ya se vieron en 1
uint8_t entradasAntes = 0;
bool completa = false;

void barrido()
{
    for (int vuelta = 1; vuelta <= 2; vuelta++)
    {
        for (int i = 0; i < 8; i++)
        {
            JWPLC_IO.setOutputs(1 << i);
            Serial.printf("Barrido %d/2: Q0.%d\n", vuelta, i);
            delay(PASO_MS);
        }
    }
    JWPLC_IO.setOutputs(0);
}

void setup()
{
    Serial.begin(115200);
    delay(300);
    Serial.println("JWPLC Basic: prueba de recepción");
    if (JWPLC_IO.fault() != JWPLC_IO_FAULT_NONE)
    {
        JWPLC_Display.setErrCode("IO");
        Serial.printf("FALLA de E/S (código %u): revise la alimentación de 24 V\n", JWPLC_IO.fault());
    }
    barrido();
    Serial.println("Ahora active cada entrada I0.0 a I0.7: su salida se enciende mientras esté activa.");
}

void loop()
{
    uint8_t entradas = JWPLC_IO.inputs();
    JWPLC_IO.setOutputs(entradas);
    uint8_t cambios = entradas ^ entradasAntes;
    for (int i = 0; i < 8; i++)
    {
        if (bitRead(cambios, i)) Serial.printf("I0.%d %s\n", i, bitRead(entradas, i) ? "ON" : "OFF");
    }
    entradasAntes = entradas;
    vistas |= entradas;
    if (!completa && vistas == 0xFF)
    {
        completa = true;
        Serial.println("PRUEBA COMPLETA: las 8 entradas y las 8 salidas responden.");
    }
    delay(10);
}
