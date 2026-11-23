// Curso JWPLC Basic · Lección 03 · Leer una entrada
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 03: aprieta el pulsador de I0.0");
}

void loop()
{
    // digitalRead() devuelve HIGH si la entrada recibe 24 V, o LOW si no.
    // El resultado se guarda en una variable para usarlo dos veces. uint8_t
    // es un número entero de 8 bits (de 0 a 255): HIGH vale 1 y LOW vale 0.
    uint8_t estado = digitalRead(I0_0);

    // La salida copia a la entrada: entrada activa -> relé cerrado.
    digitalWrite(Q0_0, estado);

    // == compara dos valores. Ojo: = guarda un valor, == pregunta si son iguales.
    if (estado == HIGH)
    {
        Serial.println("I0.0 activa");
    }
    else
    {
        Serial.println("I0.0 inactiva");
    }

    // Una pausa corta para que el Monitor Serie no se llene de mensajes.
    // En la lección 07 verás cómo avisar solo cuando la entrada cambia.
    delay(200);
}
