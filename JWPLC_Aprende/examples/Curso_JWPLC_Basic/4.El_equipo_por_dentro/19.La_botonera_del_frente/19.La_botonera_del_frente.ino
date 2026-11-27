// Curso JWPLC Basic · Lección 19 · La botonera del frente: ajustar sin la PC
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una dosificadora. OK pone en marcha la bomba (Q0.0) durante el
// tiempo ajustado; ESC la detiene antes. UP y DOWN cambian ese tiempo de a
// un segundo, sin conectar la PC.
//
// La botonera no se lee con digitalRead(): el package la revisa solo, en
// segundo plano, y la entrega en el objeto JWPLC_Buttons.

const unsigned long TIEMPO_MIN = 1;    // segundos
const unsigned long TIEMPO_MAX = 10;   // segundos

unsigned long tiempoDosis = 3;         // segundos, el que se ajusta
bool dosificando = false;
unsigned long inicioDosis = 0;

void setup()
{
    Serial.begin(115200);

    // Descarta las teclas que se hayan apretado mientras el equipo arrancaba.
    JWPLC_Buttons.clearPendingInput();

    Serial.println("Lección 19: botonera del frente, bomba dosificadora Q0.0");
    Serial.printf("Tiempo: %lu s\n", tiempoDosis);
}

void loop()
{
    // pressed() es verdadero UNA vez por cada pulsación: no hace falta
    // detectar el flanco a mano como en la lección 07.
    if (JWPLC_Buttons.pressed(BTN_UP) && tiempoDosis < TIEMPO_MAX)
    {
        tiempoDosis = tiempoDosis + 1;
        Serial.printf("Tiempo: %lu s\n", tiempoDosis);
    }

    if (JWPLC_Buttons.pressed(BTN_DOWN) && tiempoDosis > TIEMPO_MIN)
    {
        tiempoDosis = tiempoDosis - 1;
        Serial.printf("Tiempo: %lu s\n", tiempoDosis);
    }

    if (JWPLC_Buttons.pressed(BTN_OK) && !dosificando)
    {
        dosificando = true;
        inicioDosis = millis();
        Serial.printf("Dosificando %lu s\n", tiempoDosis);
    }

    if (JWPLC_Buttons.pressed(BTN_ESC) && dosificando)
    {
        dosificando = false;
        Serial.println("Dosis cancelada");
    }

    if (dosificando && millis() - inicioDosis >= tiempoDosis * 1000)
    {
        dosificando = false;
        Serial.println("Dosis completa");
    }

    digitalWrite(Q0_0, dosificando);
}
