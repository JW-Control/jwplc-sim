// Curso JWPLC Basic · Lección 11 · Máquina de estados: un semáforo · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

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
bool enModoNoche = false;      // I0.1: amarillo intermitente.

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
    // Modo noche: manda sobre la secuencia normal.
    if (digitalRead(I0_1) == HIGH)
    {
        enModoNoche = true;
        digitalWrite(Q0_0, LOW);
        digitalWrite(Q0_1, (millis() / 500) % 2 == 0);
        digitalWrite(Q0_2, LOW);
        digitalWrite(Q0_3, LOW);
        return;
    }
    if (enModoNoche)
    {
        enModoNoche = false;
        cambiarA(VERDE, "VERDE"); // al salir, empieza de nuevo
    }

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
    // Verde peatonal: fijo y, en sus últimos 3 s, intermitente.
    bool peatonVerde = estado == ROJO && (enEstado < ROJO_MS - 3000 || (enEstado / 500) % 2 == 0);
    digitalWrite(Q0_3, peatonVerde);
}
