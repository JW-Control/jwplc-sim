// Curso JWPLC Basic · Lección 02 · Encender un relé
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

void setup()
{
    // En un Arduino común habría que llamar a pinMode() para decir que el pin
    // es una salida. En el JWPLC no hace falta: las entradas y los relés ya
    // quedan listos al arrancar.
}

void loop()
{
    digitalWrite(Q0_0, HIGH); // Cierra el relé Q0.0: la lámpara enciende.
    delay(1000);              // Espera 1 segundo.

    digitalWrite(Q0_0, LOW);  // Abre el relé Q0.0: la lámpara se apaga.
    delay(1000);              // Espera 1 segundo y vuelve a empezar.
}
