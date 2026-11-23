// Curso JWPLC Basic · Lección 02 · Encender un relé · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

void setup()
{
    // En un Arduino común habría que llamar a pinMode() para decir que el pin
    // es una salida. En el JWPLC no hace falta: las entradas y los relés ya
    // quedan listos al arrancar.
}

void loop()
{
    digitalWrite(Q0_0, HIGH); // H1 enciende...
    digitalWrite(Q0_1, LOW);  // ...y H2 se apaga.
    delay(2000);              // 2 segundos.

    digitalWrite(Q0_0, LOW);  // H1 se apaga...
    digitalWrite(Q0_1, HIGH); // ...y H2 enciende.
    delay(500);               // Medio segundo.
}
