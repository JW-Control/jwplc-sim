// Curso JWPLC Basic · Lección 17 · Mensajes para el operador: un horómetro
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// unsigned long: el tipo que devuelve millis(), y el que espera %lu en printf.
const unsigned long REPORTE_MS = 5000;  // Cada cuánto se informa con el motor en marcha.

bool motor = false;
unsigned long arranques = 0;
unsigned long inicioTramo = 0;      // Cuándo arrancó esta vez.
unsigned long marchaAnterior = 0;   // Tiempo de marcha de los arranques anteriores.
unsigned long ultimoReporte = 0;

// Convierte milisegundos en un texto "hh:mm:ss", siempre con dos cifras.
String formatoHora(unsigned long ms)
{
    unsigned long segundos = ms / 1000;
    unsigned long horas = segundos / 3600;
    unsigned long minutos = (segundos / 60) % 60;
    segundos = segundos % 60;

    char texto[12];
    snprintf(texto, sizeof(texto), "%02lu:%02lu:%02lu", horas, minutos, segundos);
    return String(texto);
}

// Tiempo de marcha total: lo de antes más lo de este arranque.
unsigned long marchaTotal()
{
    if (motor)
    {
        return marchaAnterior + (millis() - inicioTramo);
    }
    return marchaAnterior;
}

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 17: marcha I0.0, paro NC I0.1, motor Q0.0");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paroSinApretar = digitalRead(I0_1) == HIGH;  // NC

    if (marcha && paroSinApretar && !motor)
    {
        motor = true;
        arranques = arranques + 1;
        inicioTramo = millis();
        ultimoReporte = millis();
        Serial.printf("Arranque %lu\n", arranques);
    }

    if (!paroSinApretar && motor)
    {
        unsigned long tramo = millis() - inicioTramo;
        marchaAnterior = marchaAnterior + tramo;
        motor = false;
        Serial.printf("Detenido tras %s\n", formatoHora(tramo).c_str());
    }

    // Con el motor en marcha, un reporte cada 5 segundos.
    if (motor && millis() - ultimoReporte >= REPORTE_MS)
    {
        ultimoReporte = ultimoReporte + REPORTE_MS;
        Serial.printf("En marcha %s | total %s\n",
                      formatoHora(millis() - inicioTramo).c_str(),
                      formatoHora(marchaTotal()).c_str());
    }

    digitalWrite(Q0_0, motor);
}
