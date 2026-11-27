// Curso JWPLC Basic · Lección 09 · Temporizadores · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

// struct agrupa datos y funciones bajo un mismo nombre. Cada temporizador
// guarda el momento en que empezó a contar y si su salida está activa, y su
// función ejecutar() lo actualiza en cada vuelta de loop().

// Retardo a la conexión (TON).
struct TON
{
    uint32_t inicioMs = 0;
    bool salida = false;

    bool ejecutar(bool entrada, uint32_t tiempoMs)
    {
        if (!entrada)
        {
            // Entrada apagada: la cuenta vuelve a empezar desde ahora.
            inicioMs = millis();
            salida = false;
        }
        else if (millis() - inicioMs >= tiempoMs)
        {
            salida = true;
        }
        return salida;
    }
};

// Retardo a la desconexión (TOF).
struct TOF
{
    uint32_t inicioMs = 0;
    bool salida = false;

    bool ejecutar(bool entrada, uint32_t tiempoMs)
    {
        if (entrada)
        {
            // Mientras la entrada esté activa, la salida también, y la cuenta
            // se reinicia en cada vuelta.
            inicioMs = millis();
            salida = true;
        }
        else if (millis() - inicioMs >= tiempoMs)
        {
            salida = false;
        }
        return salida;
    }
};

// Un temporizador para cada uso: cada uno recuerda su propio estado.
TON arranque;
TOF luzPasillo;
TON bocina;

void setup()
{
}

void loop()
{
    bool pulsador = digitalRead(I0_0) == HIGH;
    bool presencia = digitalRead(I0_1) == HIGH;

    // Se llama con nombre.ejecutar(entrada, tiempo). Devuelve la salida del
    // temporizador, que se puede escribir directo en la salida del PLC.
    digitalWrite(Q0_0, arranque.ejecutar(pulsador, 2000));
    digitalWrite(Q0_1, luzPasillo.ejecutar(presencia, 5000));

    // Bocina: la presencia lleva más de 30 s sin interrupción.
    digitalWrite(Q0_2, bocina.ejecutar(presencia, 30000));
}
