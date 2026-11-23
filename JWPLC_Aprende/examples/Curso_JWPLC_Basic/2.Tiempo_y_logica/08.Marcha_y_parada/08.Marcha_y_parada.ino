// Curso JWPLC Basic · Lección 08 · Marcha y parada de un motor
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

bool motor = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 08: marcha I0.0, parada NC I0.1, térmico NC I0.2");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;  // NC: activa en reposo.
    bool termicoNormal = digitalRead(I0_2) == HIGH;     // NC: activo si no hay falla.

    bool motorAntes = motor;

    // La regla de la escalera, en una línea.
    motor = (marcha || motor) && paradaSinApretar && termicoNormal;

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, !termicoNormal);

    // Avisa solo cuando el motor cambia (flanco, como en la lección 07).
    if (motor != motorAntes)
    {
        Serial.println(motor ? "Motor en marcha" : "Motor detenido");
    }
}
