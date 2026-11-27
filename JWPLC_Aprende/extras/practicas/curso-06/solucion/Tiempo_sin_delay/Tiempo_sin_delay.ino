// Curso JWPLC Basic · Lección 06 · Esperar sin detener el programa · Solución
// Una solución de la práctica: cumple los objetivos de rubrica.json. La guía
// de la lección está en el README.md del ejemplo del curso.

// Cada cuánto cambia la intermitencia, en milisegundos. "const" indica que
// es un valor fijo: el programa no lo puede modificar por error.
const uint32_t INTERVALO_MS = 500;
const uint32_t INTERVALO_2_MS = 2000; // Q0.2: su propio ritmo

// Momento (en milisegundos) del último cambio de la intermitencia.
uint32_t ultimoCambio = 0;

// Estado actual de la luz intermitente.
bool luzEncendida = false;

// La segunda intermitencia lleva su propio reloj.
uint32_t ultimoCambio2 = 0;
bool luz2 = false;

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
    if (ahora - ultimoCambio2 >= INTERVALO_2_MS)
    {
        ultimoCambio2 = ahora;
        luz2 = !luz2;
        digitalWrite(Q0_2, luz2);
    }

    digitalWrite(Q0_1, digitalRead(I0_0));
}
