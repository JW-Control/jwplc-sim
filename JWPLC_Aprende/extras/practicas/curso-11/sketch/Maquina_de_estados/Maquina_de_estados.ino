// Curso JWPLC Basic · Lección 11 · Máquina de estados: un semáforo
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Los estados del semáforo. Internamente cada nombre es un número, pero
// en el programa se lee mucho mejor VERDE que 0.
enum Estado
{
    VERDE,
    AMARILLO,
    ROJO
};

const uint32_t VERDE_MINIMO_MS = 10000;
const uint32_t VERDE_MAXIMO_MS = 30000;
const uint32_t AMARILLO_MS = 3000;
const uint32_t ROJO_MS = 8000;

Estado estado = VERDE;
uint32_t inicioEstado = 0;     // Momento en que se entró al estado actual.
bool peatonEsperando = false;  // Recuerda el pedido del botón.

// Cambia de estado y anota el momento, para medir cuánto lleva en él.
void cambiarA(Estado nuevo, const char nombre[])
{
    estado = nuevo;
    inicioEstado = millis();
    Serial.print("Estado: ");
    Serial.println(nombre);
}

void setup()
{
    Serial.begin(115200);
    cambiarA(VERDE, "VERDE");
}

void loop()
{
    uint32_t enEstado = millis() - inicioEstado;

    // El pedido del peatón se guarda aunque el botón se suelte enseguida.
    if (digitalRead(I0_0) == HIGH)
    {
        peatonEsperando = true;
    }

    // switch elige el bloque "case" del estado actual. Cada bloque termina
    // con break. Así solo se revisan las condiciones del paso en el que está.
    switch (estado)
    {
    case VERDE:
        if ((peatonEsperando && enEstado >= VERDE_MINIMO_MS) || enEstado >= VERDE_MAXIMO_MS)
        {
            cambiarA(AMARILLO, "AMARILLO");
        }
        break;

    case AMARILLO:
        if (enEstado >= AMARILLO_MS)
        {
            peatonEsperando = false; // El pedido ya se atiende.
            cambiarA(ROJO, "ROJO");
        }
        break;

    case ROJO:
        if (enEstado >= ROJO_MS)
        {
            cambiarA(VERDE, "VERDE");
        }
        break;
    }

    // Las salidas dependen solo del estado: cada luz tiene una sola regla.
    digitalWrite(Q0_0, estado == ROJO);
    digitalWrite(Q0_1, estado == AMARILLO);
    digitalWrite(Q0_2, estado == VERDE);
    digitalWrite(Q0_3, estado == ROJO);
}
