// Curso JWPLC Basic · Lección 05 · Las 8 entradas y las 8 salidas
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 05: las 8 entradas y los 8 relés en un byte");
}

void loop()
{
    // Una sola lectura trae las 8 entradas. uint8_t es un número de 8 bits
    // (de 0 a 255): justo un bit para cada entrada.
    uint8_t entradas = digitalReadBlock(I0_X);

    // Una sola escritura manda los 8 relés: cada bit va al relé de su número.
    digitalWriteBlock(Q0_X, entradas);

    // El bucle for repite el bloque con i = 0, 1, 2 ... 7.
    //   uint8_t i = 0   -> empieza en 0
    //   i < I0_COUNT    -> sigue mientras i sea menor que 8
    //   i++             -> al terminar cada vuelta, suma 1
    // bitRead(entradas, i) saca el bit número i del byte: 1 o 0.
    Serial.print("Entradas: ");
    for (uint8_t i = 0; i < I0_COUNT; i++)
    {
        Serial.print(bitRead(entradas, i));
        Serial.print(' ');
    }
    Serial.println();

    // Fíjate en algo: con esta pausa, un relé tarda hasta medio segundo en
    // seguir a su entrada, porque mientras delay() espera el programa no
    // lee nada. La lección 06 muestra cómo esperar sin detener el programa.
    delay(500);
}
