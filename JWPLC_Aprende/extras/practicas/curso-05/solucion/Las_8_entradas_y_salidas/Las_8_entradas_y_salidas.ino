// Curso JWPLC Basic · Lección 05 · Las 8 entradas y las 8 salidas · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

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
    // Salidas cruzadas: la entrada i manda el relé 7 - i. Y de paso se
    // cuentan las entradas activas.
    uint8_t activas = 0;
    for (uint8_t i = 0; i < I0_COUNT; i++)
    {
        digitalWrite(Q0_X[7 - i], bitRead(entradas, i));
        activas += bitRead(entradas, i);
    }

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
    Serial.print("Activas: ");
    Serial.println(activas);

    // Fíjate en algo: con esta pausa, un relé tarda hasta medio segundo en
    // seguir a su entrada, porque mientras delay() espera el programa no
    // lee nada. La lección 06 muestra cómo esperar sin detener el programa.
    delay(500);
}
