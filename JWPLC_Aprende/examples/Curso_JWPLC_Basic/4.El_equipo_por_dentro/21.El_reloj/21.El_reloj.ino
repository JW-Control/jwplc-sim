// Curso JWPLC Basic · Lección 21 · El reloj: encender por horario
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el alumbrado de una vitrina. El contactor KM1 (Q0.0) lo
// enciende a las 18:00:00 y lo apaga a las 23:00:00, todos los días.
//
// El reloj del equipo (RTC) sigue contando con su batería aunque se corte
// la energía. El package lo lee solo y lo entrega en JWPLC_Time.

// Una hora del día pasada a segundos desde la medianoche:
// 18:00:00 -> 64 800. Así comparar horas es comparar dos números.
unsigned long segundosDelDia(unsigned long h, unsigned long m, unsigned long s)
{
    return h * 3600 + m * 60 + s;
}

const unsigned long ENCENDIDO = segundosDelDia(18, 0, 0);
const unsigned long APAGADO = segundosDelDia(23, 0, 0);
const unsigned long REPORTE_MS = 10000;

bool alumbrado = false;
bool sinHora = false;
unsigned long ultimoReporte = 0;

// La hora actual como texto hh:mm:ss.
String horaActual()
{
    char texto[10];
    snprintf(texto, sizeof(texto), "%02u:%02u:%02u", JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
    return String(texto);
}

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 21: alumbrado por horario, KM1 en Q0.0");
    Serial.printf("Horario: de %s a %s\n", "18:00:00", "23:00:00");
}

void loop()
{
    // Sin hora válida (RTC sin batería o sin ajustar) no se adivina:
    // falla segura, el alumbrado queda apagado.
    if (!JWPLC_Time.valid())
    {
        if (!sinHora)
        {
            sinHora = true;
            Serial.println("RTC sin hora: alumbrado apagado");
        }
        alumbrado = false;
        digitalWrite(Q0_0, alumbrado);
        return;
    }

    unsigned long ahora = segundosDelDia(JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
    bool enHorario = ahora >= ENCENDIDO && ahora < APAGADO;

    if (enHorario != alumbrado)
    {
        alumbrado = enHorario;
        Serial.printf("%s · alumbrado %s\n", horaActual().c_str(), alumbrado ? "ENCENDIDO" : "APAGADO");
    }

    if (millis() - ultimoReporte >= REPORTE_MS)
    {
        ultimoReporte = millis();
        Serial.printf("%s · alumbrado %s\n", horaActual().c_str(), alumbrado ? "encendido" : "apagado");
    }

    digitalWrite(Q0_0, alumbrado);
}
