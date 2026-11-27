// Curso JWPLC Basic · Lección 15 · Modos de operación: manual y automático
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// El TON de la lección 14.
class TON
{
public:
    bool ejecutar(bool entrada, uint32_t tiempoMs)
    {
        if (!entrada)
        {
            contando = false;
            salida = false;
        }
        else
        {
            if (!contando)
            {
                contando = true;
                inicio = millis();
            }
            salida = millis() - inicio >= tiempoMs;
        }
        return salida;
    }

private:
    uint32_t inicio = 0;
    bool contando = false;
    bool salida = false;
};

// Las tres posiciones del selector MAN - 0 - AUT.
enum Modo
{
    MANUAL,
    APAGADO,
    AUTOMATICO
};

// Los pasos del ciclo automático.
enum Paso
{
    REPOSO,
    MEZCLANDO,
    DESCARGANDO
};

const uint32_t MEZCLA_MS = 8000;
const uint32_t DESCARGA_MS = 3000;

Modo modo = APAGADO;
Paso paso = REPOSO;
TON tiempoMezcla;
TON tiempoDescarga;

// El selector tiene dos contactos: uno cierra en MAN y otro en AUT.
// Con los dos abiertos está en 0.
Modo leerModo()
{
    if (digitalRead(I0_0) == HIGH)
    {
        return MANUAL;
    }
    if (digitalRead(I0_1) == HIGH)
    {
        return AUTOMATICO;
    }
    return APAGADO;
}

void avisarModo(Modo m)
{
    switch (m)
    {
    case MANUAL:
        Serial.println("Modo: MANUAL");
        break;
    case APAGADO:
        Serial.println("Modo: APAGADO");
        break;
    case AUTOMATICO:
        Serial.println("Modo: AUTOMATICO");
        break;
    }
}

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 15: selector MAN I0.0 / AUT I0.1, impulso I0.2, ciclo I0.3");
    avisarModo(modo);
}

void loop()
{
    Modo nuevo = leerModo();
    if (nuevo != modo)
    {
        // Cambiar de modo siempre cancela el ciclo: la máquina queda quieta
        // y el operador decide qué hacer en el modo nuevo.
        modo = nuevo;
        paso = REPOSO;
        avisarModo(modo);
    }

    bool motor = false;

    switch (modo)
    {
    case MANUAL:
        // Marcha por impulsos: el motor gira solo mientras se aprieta.
        motor = digitalRead(I0_2) == HIGH;
        break;

    case APAGADO:
        motor = false;
        break;

    case AUTOMATICO:
        // Un toque a CICLO: mezcla 8 s, descarga 3 s y vuelve a reposo.
        if (paso == REPOSO && digitalRead(I0_3) == HIGH)
        {
            paso = MEZCLANDO;
            Serial.println("Ciclo: mezclando");
        }
        if (tiempoMezcla.ejecutar(paso == MEZCLANDO, MEZCLA_MS))
        {
            paso = DESCARGANDO;
            Serial.println("Ciclo: descargando");
        }
        if (tiempoDescarga.ejecutar(paso == DESCARGANDO, DESCARGA_MS))
        {
            paso = REPOSO;
            Serial.println("Ciclo terminado");
        }
        motor = paso == MEZCLANDO;
        break;
    }

    // H2: fija en automático sin ciclo; parpadea cada 500 ms con el ciclo en curso.
    bool parpadeo = (millis() / 500) % 2 == 0;
    bool luzAuto = modo == AUTOMATICO && (paso == REPOSO || parpadeo);

    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, modo == MANUAL);
    digitalWrite(Q0_2, luzAuto);
    digitalWrite(Q0_3, paso == DESCARGANDO);
}
