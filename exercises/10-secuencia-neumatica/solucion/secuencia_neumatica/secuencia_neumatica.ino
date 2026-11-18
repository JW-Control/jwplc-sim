// Ejercicio 10 · Secuencia electroneumática A+ B+ B- A- C+ D+ D- C- · solución de referencia.
//   I0_0  A0, sensor magnético: cilindro A retraído      I0_1  A1: cilindro A extendido
//   I0_2  B0: cilindro B retraído                        I0_3  B1: cilindro B extendido
//   I0_4  C0: cilindro C retraído                        I0_5  C1: cilindro C extendido
//   I0_6  D0: cilindro D retraído                        I0_7  D1: cilindro D extendido
//   Q0_0  Y1, electroválvula 5/2 monoestable del cilindro A (Q0_1 Y2 → B, Q0_2 Y3 → C, Q0_3 Y4 → D)
//   Q0_4  H1, piloto verde: en marcha
//   Q0_5  H2, piloto amarillo: en pausa
//   Q0_6  H3, piloto rojo: falla (parpadea)
//   Botones del frente del JWPLC Basic: OK = Arranque, ESC = Pausa, LEFT = Reset.
//
// Cada paso espera su final de carrera (y que el del extremo opuesto se apague).
// Si no llega en 3 s, la máquina se detiene en falla con el código en ERR de la
// pantalla: «T» + sensor que no llegó (p. ej. TB1) o «P» + sensor pegado (p. ej. PA0).
// Reset retrae todos los cilindros y deja la máquina lista para arrancar.
#include <Arduino.h>

const uint16_t SENSOR_FUERA[4] = { I0_1, I0_3, I0_5, I0_7 };
const uint16_t SENSOR_DENTRO[4] = { I0_0, I0_2, I0_4, I0_6 };
const uint16_t VALVULA[4] = { Q0_0, Q0_1, Q0_2, Q0_3 };
const char LETRA[4] = { 'A', 'B', 'C', 'D' };

// Secuencia: cilindro y sentido de cada paso (true = sale).
const uint8_t PASO_CILINDRO[8] = { 0, 1, 1, 0, 2, 3, 3, 2 };
const bool PASO_SALE[8] = { true, true, false, false, true, true, false, false };

const unsigned long VIGILANCIA_MS = 3000;

enum Estado { LISTA, MARCHA, PAUSA, FALLA, RETORNO };

Estado estado = RETORNO;   // al encender, primero lleva los cilindros a reposo
uint8_t paso = 0;
bool salida[4] = { false, false, false, false };
unsigned long inicioPaso = 0;
unsigned long esperaAcumulada = 0;   // tiempo de vigilancia ya consumido antes de una pausa
char codigo[5] = "";

bool dentro(uint8_t c) { return digitalRead(SENSOR_DENTRO[c]); }
bool fuera(uint8_t c) { return digitalRead(SENSOR_FUERA[c]); }

bool enReposo()
{
    for (uint8_t c = 0; c < 4; c++)
        if (!dentro(c) || fuera(c)) return false;
    return true;
}

void escribirValvulas()
{
    for (uint8_t c = 0; c < 4; c++) digitalWrite(VALVULA[c], salida[c]);
}

void fallar(char tipo, uint8_t c, bool sensorFuera)
{
    codigo[0] = tipo;
    codigo[1] = LETRA[c];
    codigo[2] = sensorFuera ? '1' : '0';
    codigo[3] = 0;
    JWPLC_Display.setErrCode(codigo);
    Serial.print("FALLA ");
    Serial.print(codigo);
    Serial.println(tipo == 'T' ? " (el sensor no llegó a tiempo)" : " (sensor pegado)");
    estado = FALLA;
}

void iniciarPaso(unsigned long ahora)
{
    const uint8_t c = PASO_CILINDRO[paso];
    salida[c] = PASO_SALE[paso];
    inicioPaso = ahora;
    esperaAcumulada = 0;
    Serial.print("Paso ");
    Serial.print(paso + 1);
    Serial.print(": ");
    Serial.print(LETRA[c]);
    Serial.println(PASO_SALE[paso] ? "+" : "-");
}

void iniciarRetorno(unsigned long ahora)
{
    for (uint8_t c = 0; c < 4; c++) salida[c] = false;
    inicioPaso = ahora;
    estado = RETORNO;
    Serial.println("Reset: retornando a reposo");
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Display.setIdleWakeMode(IDLE_WAKE_DISABLED);
    JWPLC_Display.setErrCode("");
    JWPLC_Buttons.clearPendingInput();
    iniciarRetorno(millis());
}

void loop()
{
    const unsigned long ahora = millis();
    const bool arranque = JWPLC_Buttons.pressed(BTN_OK);
    const bool pausa = JWPLC_Buttons.pressed(BTN_ESC);
    const bool reset = JWPLC_Buttons.pressed(BTN_LEFT);

    if (reset && estado != RETORNO)
    {
        JWPLC_Display.setErrCode("");
        iniciarRetorno(ahora);
    }

    switch (estado)
    {
    case LISTA:
        if (arranque)
        {
            if (enReposo())
            {
                paso = 0;
                estado = MARCHA;
                Serial.println("Arranque");
                iniciarPaso(ahora);
            }
            else
            {
                Serial.println("No arranca: los cilindros no están en reposo (pulse Reset)");
            }
        }
        break;

    case MARCHA:
    {
        if (pausa)
        {
            esperaAcumulada += ahora - inicioPaso;
            estado = PAUSA;
            Serial.println("Pausa");
            break;
        }
        const uint8_t c = PASO_CILINDRO[paso];
        const bool sale = PASO_SALE[paso];
        const bool llego = sale ? fuera(c) : dentro(c);
        const bool opuesto = sale ? dentro(c) : fuera(c);
        if (llego && !opuesto)
        {
            paso = (paso + 1) % 8;   // ciclo continuo
            iniciarPaso(ahora);
        }
        else if (esperaAcumulada + (ahora - inicioPaso) > VIGILANCIA_MS)
        {
            if (llego) fallar('P', c, !sale);   // llegó, pero el sensor del otro extremo sigue activo
            else fallar('T', c, sale);
        }
        break;
    }

    case PAUSA:
        if (arranque)
        {
            inicioPaso = ahora;
            estado = MARCHA;
            Serial.println("Continúa");
        }
        break;

    case RETORNO:
        if (enReposo())
        {
            estado = LISTA;
            Serial.println("Lista: pulse OK para arrancar");
        }
        else if (ahora - inicioPaso > VIGILANCIA_MS)
        {
            for (uint8_t c = 0; c < 4; c++)
            {
                if (!dentro(c)) { fallar('T', c, false); break; }
                if (fuera(c)) { fallar('P', c, true); break; }
            }
        }
        break;

    case FALLA:
        break;
    }

    escribirValvulas();
    digitalWrite(Q0_4, estado == MARCHA);
    digitalWrite(Q0_5, estado == PAUSA);
    digitalWrite(Q0_6, estado == FALLA && (ahora / 500) % 2 == 0);
    JWPLC_Display.setRunLed(estado == MARCHA);
    delay(1);
}
