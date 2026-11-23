// Curso JWPLC Basic · Lección 06 · Esperar sin detener el programa
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Cada cuánto cambia la intermitencia, en milisegundos. "const" indica que
// es un valor fijo: el programa no lo puede modificar por error.
const uint32_t INTERVALO_MS = 500;

// Momento (en milisegundos) del último cambio de la intermitencia.
uint32_t ultimoCambio = 0;

// Estado actual de la luz intermitente.
bool luzEncendida = false;

void setup()
{
}

void loop()
{
    // millis() devuelve los milisegundos que pasaron desde el arranque.
    uint32_t ahora = millis();

    // Tarea 1: la intermitencia. "ahora - ultimoCambio" es el tiempo que pasó
    // desde el último cambio. Esta resta sigue funcionando bien incluso
    // cuando millis() vuelve a empezar desde 0, después de unos 49 días.
    if (ahora - ultimoCambio >= INTERVALO_MS)
    {
        ultimoCambio = ahora;
        luzEncendida = !luzEncendida; // Si estaba encendida se apaga, y al revés.
        digitalWrite(Q0_0, luzEncendida);
    }

    // Tarea 2: el pulsador. Como nadie se queda esperando, esta línea se
    // ejecuta miles de veces por segundo y responde al instante.
    digitalWrite(Q0_1, digitalRead(I0_0));
}
