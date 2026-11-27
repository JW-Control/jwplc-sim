// Curso JWPLC Basic · Lección 13 · Arreglos de objetos: cuatro cintas
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// El material va de la cinta 1 a la 4, y la 4 descarga. Para no echar
// material sobre una cinta detenida, se arranca desde la última hacia la
// primera, una cada 2 segundos.

class Cinta
{
public:
    Cinta(uint16_t rele, int numero)
    {
        salida = rele;
        nombre = "Cinta " + String(numero);
    }

    void encender()
    {
        if (!encendida)
        {
            encendida = true;
            Serial.println(nombre + " encendida");
        }
    }

    void apagar()
    {
        if (encendida)
        {
            encendida = false;
            Serial.println(nombre + " apagada");
        }
    }

    bool estaEncendida()
    {
        return encendida;
    }

    void escribirSalida()
    {
        digitalWrite(salida, encendida);
    }

private:
    uint16_t salida;
    String nombre;
    bool encendida = false;
};

const int CANTIDAD = 4;
const uint32_t PASO_ARRANQUE_MS = 2000;
const uint32_t PASO_PARADA_MS = 1000;

// Un arreglo: cuatro cintas bajo un solo nombre. cintas[0] es la primera
// y cintas[3] la última: los índices empiezan en 0.
Cinta cintas[CANTIDAD] = {
    Cinta(Q0_0, 1),
    Cinta(Q0_1, 2),
    Cinta(Q0_2, 3),
    Cinta(Q0_3, 4),
};

bool arrancando = false;
bool parando = false;
int siguiente = 0;         // Índice de la próxima cinta que se enciende.
uint32_t ultimoPaso = 0;   // Cuándo se encendió la anterior.

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 13: marcha I0.0, parada NC I0.1, cintas en Q0.0 a Q0.3");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;  // NC

    // MARCHA empieza la secuencia por la última cinta.
    if (marcha && paradaSinApretar && !arrancando && !parando && !cintas[0].estaEncendida())
    {
        arrancando = true;
        siguiente = CANTIDAD - 1;
        cintas[siguiente].encender();
        ultimoPaso = millis();
    }

    // Cada 2 segundos, la cinta anterior.
    if (arrancando && millis() - ultimoPaso >= PASO_ARRANQUE_MS)
    {
        siguiente = siguiente - 1;
        cintas[siguiente].encender();
        ultimoPaso = millis();
        if (siguiente == 0)
        {
            arrancando = false;  // Ya están todas.
        }
    }

    // PARADA vacía las cintas: de la primera a la última, una por segundo.
    if (!paradaSinApretar && !parando && cintas[CANTIDAD - 1].estaEncendida())
    {
        arrancando = false;
        parando = true;
        siguiente = 0;
        cintas[siguiente].apagar();
        ultimoPaso = millis();
    }

    if (parando && millis() - ultimoPaso >= PASO_PARADA_MS)
    {
        siguiente = siguiente + 1;
        cintas[siguiente].apagar();
        ultimoPaso = millis();
        if (siguiente == CANTIDAD - 1)
        {
            parando = false;
        }
    }

    for (int i = 0; i < CANTIDAD; i++)
    {
        cintas[i].escribirSalida();
    }
    digitalWrite(Q0_4, arrancando || parando);
}
