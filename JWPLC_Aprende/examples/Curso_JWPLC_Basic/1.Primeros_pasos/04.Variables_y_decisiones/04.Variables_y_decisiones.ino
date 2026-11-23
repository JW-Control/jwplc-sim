// Curso JWPLC Basic · Lección 04 · Variables y decisiones
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

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

    // Y: con if / else, para ver la decisión paso a paso.
    if (manoIzquierda && manoDerecha)
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
}
