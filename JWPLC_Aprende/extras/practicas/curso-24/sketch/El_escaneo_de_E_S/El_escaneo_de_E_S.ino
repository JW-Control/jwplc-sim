// Curso JWPLC Basic · Lección 24 · El escaneo de E/S: las 8 entradas de una vez
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un panel de prueba. Cada entrada de I0.0 a I0.3 se repite en
// su lámpara (Q0.0 a Q0.3) y cada cambio se anota por el Monitor Serie.
//
// El package lee las 8 entradas juntas, en segundo plano, y guarda la foto
// en JWPLC_IO. Leer esa foto es instantáneo y las 8 entradas son del mismo
// instante.

uint8_t entradasAntes = 0;

// Un byte como 8 ceros y unos, de I0.7 (izquierda) a I0.0 (derecha).
String enBinario(uint8_t valor)
{
    String texto = "";
    for (int bit = 7; bit >= 0; bit--)
    {
        texto += bitRead(valor, bit) ? "1" : "0";
    }
    return texto;
}

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 24: entradas I0.0 a I0.3, lámparas Q0.0 a Q0.3");
}

void loop()
{
    // Las 8 entradas en un solo byte: el bit 0 es I0.0, el bit 1 es I0.1…
    uint8_t entradas = JWPLC_IO.inputs();

    // XOR (^) deja en 1 solo los bits que cambiaron desde la vuelta anterior.
    uint8_t cambios = entradas ^ entradasAntes;

    if (cambios != 0)
    {
        for (int i = 0; i < 8; i++)
        {
            if (bitRead(cambios, i))
            {
                Serial.printf("%6.2f s  I0.%d %s\n", millis() / 1000.0, i, bitRead(entradas, i) ? "ON" : "OFF");
            }
        }
        Serial.printf("Entradas: %s\n", enBinario(entradas).c_str());
    }
    entradasAntes = entradas;

    // Las lámparas siguen a las entradas I0.0 a I0.3. La máscara 0x0F
    // (00001111) deja pasar esos 4 bits y apaga los demás.
    JWPLC_IO.setOutputs(entradas & 0x0F);
}
