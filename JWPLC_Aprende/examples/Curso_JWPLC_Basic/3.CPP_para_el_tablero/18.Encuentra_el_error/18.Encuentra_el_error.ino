// Curso JWPLC Basic · Lección 18 · Encuentra el error: depurar un programa
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// ATENCIÓN: este programa tiene DOS errores a propósito. Compila sin
// problemas, pero la máquina no hace lo que debe. La lección te guía para
// encontrar el primero con el depurador; el segundo es tu práctica.

// La máquina: una empacadora. Cada botella que pasa por el sensor B1 se
// cuenta; cada 6 botellas el empujador Y1 da un golpe de medio segundo y
// manda el paquete a la cinta de salida.

const unsigned long POR_PAQUETE = 6;
const unsigned long EMPUJE_MS = 500;

unsigned long botellas = 0;
bool empujando = false;
unsigned long inicioEmpuje = 0;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 18: sensor de botellas I0.0, empujador Q0.0");
}

void loop()
{
    bool botella = digitalRead(I0_0) == HIGH;

    // Contar las botellas.
    if (botella)
    {
        botellas = botellas + 1;
    }

    // Con el paquete completo, empujar.
    if (botellas > 0 && botellas % POR_PAQUETE == 0 && !empujando)
    {
        empujando = true;
        inicioEmpuje = millis();
        Serial.printf("Paquete listo: %lu botellas\n", botellas);
    }

    // El golpe dura medio segundo.
    if (empujando && millis() - inicioEmpuje >= EMPUJE_MS)
    {
        empujando = false;
    }

    digitalWrite(Q0_0, empujando);
}
