// Curso JWPLC Basic · Lección 08 · Marcha y parada de un motor · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

bool motor = false;

// Falla del térmico memorizada: se borra solo con PARADA.
bool falla = false;

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

    if (!termicoNormal)
    {
        falla = true;
    }
    if (!paradaSinApretar && termicoNormal)
    {
        falla = false; // PARADA reconoce la falla
    }

    bool motorAntes = motor;

    // La regla de la escalera, en una línea.
    motor = (marcha || motor) && paradaSinApretar && termicoNormal && !falla;

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, falla);
    digitalWrite(Q0_2, motor);

    // Avisa solo cuando el motor cambia (flanco, como en la lección 07).
    if (motor != motorAntes)
    {
        Serial.println(motor ? "Motor en marcha" : "Motor detenido");
    }
}
