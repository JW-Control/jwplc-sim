// Curso JWPLC Basic · Lección 20 · El buzzer: avisos que se oyen
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una faja larga, donde el operador no ve a todos los que
// trabajan junto a ella. Antes de arrancar, el buzzer avisa durante 2
// segundos. Si el térmico salta, suena la alarma hasta que alguien la
// reconoce con OK en la botonera.
//
// El buzzer del equipo está en el objeto JWPLC_Buzzer: suena solo, en
// segundo plano, mientras el programa sigue trabajando.

const unsigned long AVISO_MS = 2000;   // Cuánto avisa antes de arrancar.

// Una melodía es una lista de notas: {frecuencia en Hz, duración en ms}.
// Frecuencia 0 = silencio.
const JWPLC_BuzzerNote AVISO[] = {
    {2000, 300}, {0, 200},
    {2000, 300}, {0, 200},
    {2000, 300}, {0, 200}};

const JWPLC_BuzzerNote ALARMA[] = {
    {1500, 250}, {1000, 250}};

bool avisando = false;
bool motor = false;
bool falla = false;
bool reconocida = false;
unsigned long inicioAviso = 0;
const unsigned long PARPADEO_MS = 500;   // Práctica: H1 parpadea hasta reconocer.

void setup()
{
    Serial.begin(115200);
    JWPLC_Buzzer.setVolume(64);   // De 0 a 255.
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 20: marcha I0.0, paro NC I0.1, térmico NC I0.2, motor Q0.0, falla Q0.1");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paro = digitalRead(I0_1) == LOW;      // NC: sin señal = apretado
    bool termico = digitalRead(I0_2) == LOW;   // NC: sin señal = disparado

    // Práctica: con el térmico abierto, MARCHA no arranca.
    static bool marchaAntes = false;
    if (marcha && !marchaAntes && falla)
    {
        JWPLC_Buzzer.beep(300, 600);   // Tono grave: «no se puede».
        Serial.println("Bloqueado: térmico abierto");
    }
    marchaAntes = marcha;

    // Marcha: primero el aviso, después el motor.
    if (marcha && !motor && !avisando && !falla && !termico)
    {
        avisando = true;
        inicioAviso = millis();
        JWPLC_Buzzer.play(AVISO, sizeof(AVISO) / sizeof(AVISO[0]));
        Serial.println("Aviso de arranque");
    }

    if (avisando && millis() - inicioAviso >= AVISO_MS)
    {
        avisando = false;
        motor = true;
        Serial.println("Motor en marcha");
    }

    if (paro && (motor || avisando))
    {
        avisando = false;
        motor = false;
        JWPLC_Buzzer.stop();
        JWPLC_Buzzer.beep();      // Un pitido corto: «entendido».
        Serial.println("Motor detenido");
    }

    // Falla: el térmico detiene el motor y la alarma suena en bucle.
    if (termico && !falla)
    {
        falla = true;
        reconocida = false;
        avisando = false;
        motor = false;
        JWPLC_Buzzer.play(ALARMA, sizeof(ALARMA) / sizeof(ALARMA[0]), true);
        Serial.println("Falla: térmico");
    }

    // OK en la botonera reconoce la alarma: se calla el buzzer.
    if (JWPLC_Buttons.pressed(BTN_OK) && falla && !reconocida)
    {
        reconocida = true;
        JWPLC_Buzzer.stop();
        Serial.println("Alarma reconocida");
    }

    // La falla termina cuando el térmico vuelve a la normalidad y ya se reconoció.
    if (falla && reconocida && !termico)
    {
        falla = false;
        Serial.println("Térmico normal");
    }

    digitalWrite(Q0_0, motor);
    // Sin reconocer, H1 parpadea; reconocida, queda fija.
    bool luz = falla && (reconocida || (millis() / PARPADEO_MS) % 2 == 0);
    digitalWrite(Q0_1, luz);
}
