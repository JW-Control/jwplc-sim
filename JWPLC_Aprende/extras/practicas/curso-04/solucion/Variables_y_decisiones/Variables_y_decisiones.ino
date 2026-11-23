// Curso JWPLC Basic · Lección 04 · Variables y decisiones · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

void setup()
{
    // Nada que preparar: las entradas y los relés ya están listos.
}

void loop()
{
    // Se lee cada entrada una vez y se guarda con un nombre claro.
    // digitalRead() devuelve HIGH o LOW; al compararlo con == HIGH queda
    // un bool: true si la entrada está activa.
    bool manoIzquierda = digitalRead(I0_0) == HIGH;
    bool manoDerecha = digitalRead(I0_1) == HIGH;
    bool terceraMano = digitalRead(I0_2) == HIGH;

    // Y: con if / else, para ver la decisión paso a paso.
    if (manoIzquierda && manoDerecha && terceraMano)
    {
        digitalWrite(Q0_0, HIGH);
    }
    else
    {
        digitalWrite(Q0_0, LOW);
    }

    // O: lo mismo en una sola línea. Un bool también se puede escribir
    // directo en la salida: true cierra el relé y false lo abre.
    digitalWrite(Q0_1, manoIzquierda || manoDerecha);

    // NO: el signo ! invierte el valor.
    digitalWrite(Q0_2, !manoIzquierda);

    // != pregunta si dos valores son distintos.
    digitalWrite(Q0_3, manoIzquierda != manoDerecha);

    // Q0.4: I0.0 activa pero I0.1 suelta.
    digitalWrite(Q0_4, manoIzquierda && !manoDerecha);
}
