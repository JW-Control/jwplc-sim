// Curso JWPLC Basic · Lección 54 · Horómetro: el tiempo de marcha que no se pierde
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una bomba con marcha y parada. El mantenimiento de una
// máquina se programa por HORAS DE MARCHA, no por días: los rodamientos se
// gastan cuando el motor gira. El HORÓMETRO las cuenta.
//
// Cada segundo con el motor en marcha suma 1 y se guarda en la FRAM
// (lección 22): un corte de luz no borra la cuenta. La FRAM aguanta
// billones de escrituras, así que guardar cada segundo no la gasta.
//
// Para probar en minutos, el aviso de mantenimiento de la práctica usa 20 s;
// en una bomba real serían unas 2000 horas.

struct Horometro
{
    unsigned long segundos;
};

const unsigned long DIRECCION = 0;
const uint8_t VERSION = 1;

Horometro horas = {};
bool motor = false;
unsigned long ultimoSegundo = 0;

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 54: horómetro en FRAM, marcha I0.0, parada NC I0.1");
    if (JWPLC_FRAM.readBlock(DIRECCION, horas, VERSION))
        Serial.printf("Marcha acumulada: %lu s\n", horas.segundos);
    else
    {
        horas.segundos = 0;
        JWPLC_FRAM.writeBlock(DIRECCION, horas, VERSION);
        Serial.println("Horómetro nuevo en 0");
    }
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    bool motorAntes = motor;
    motor = (marcha || motor) && paradaSinApretar;
    if (motor && !motorAntes)
    {
        ultimoSegundo = millis();
        Serial.println("Motor en marcha");
    }
    if (!motor && motorAntes)
        Serial.printf("Motor detenido. Marcha acumulada: %lu s\n", horas.segundos);
    digitalWrite(Q0_0, motor);

    // ---- Un segundo más de marcha, guardado al momento.
    if (motor && millis() - ultimoSegundo >= 1000)
    {
        ultimoSegundo = ultimoSegundo + 1000;    // sin perder los milisegundos sobrantes
        horas.segundos = horas.segundos + 1;
        JWPLC_FRAM.writeBlock(DIRECCION, horas, VERSION);
        if (horas.segundos % 5 == 0)
            Serial.printf("Marcha acumulada: %lu s\n", horas.segundos);
    }
}
