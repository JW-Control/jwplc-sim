// Curso JWPLC Basic · Lección 18 · Encuentra el error: depurar un programa
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Solución: los dos errores corregidos y la cuenta de paquetes.

// La máquina: una empacadora. Cada botella que pasa por el sensor B1 se
// cuenta; cada 6 botellas el empujador Y1 da un golpe de medio segundo y
// manda el paquete a la cinta de salida.

const unsigned long POR_PAQUETE = 6;
const unsigned long EMPUJE_MS = 500;

unsigned long botellas = 0;
unsigned long paquetes = 0;
bool botellaAnterior = false;
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

    // Error 1: contaba en cada vuelta mientras la botella tapaba el sensor.
    // Se cuenta en el flanco de subida: una vez por botella.
    if (botella && !botellaAnterior)
    {
        botellas = botellas + 1;

        // Error 2: el paquete se revisaba en cada vuelta, y con 6 botellas la
        // condición seguía cierta después del golpe. Se revisa solo al contar.
        if (botellas % POR_PAQUETE == 0)
        {
            empujando = true;
            inicioEmpuje = millis();
            paquetes = paquetes + 1;
            Serial.printf("Paquete listo: %lu botellas\n", botellas);
            Serial.printf("Paquetes: %lu\n", paquetes);
        }
    }
    botellaAnterior = botella;

    // El golpe dura medio segundo.
    if (empujando && millis() - inicioEmpuje >= EMPUJE_MS)
    {
        empujando = false;
    }

    digitalWrite(Q0_0, empujando);
}
