// Curso JWPLC Basic · Lección 57 · Proyecto: el tablero de una bomba de pozo
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// El proyecto de la unidad: el tablero de una bomba de pozo profundo, con
// todo el oficio de la unidad:
//   I0.0  S1 marcha (NA)            I0.1  S2 parada (NC)
//   I0.2  KM1 13-14, realimentación I0.3  ES emergencia (NC, corta Q0.0)
//   I0.4  F1 térmico (NC)           I0.5  S3 rearme (NA)
//   Q0.0  KM1 bomba                 Q0.1  H1 falla / emergencia
//   Q0.2  H2 bomba en marcha
//
// - Emergencia con rearme (lección 52)
// - Realimentación de KM1: «no cierra» (lección 53)
// - Térmico como falla enclavada con su hora (lección 56)
// - Horómetro en la FRAM (lección 54)
// Rearme (S3) sirve para las dos cosas: rearmar la emergencia y reconocer
// una falla, siempre que su causa ya no esté.

struct Memoria
{
    unsigned long segundos;
};

enum Estado : uint8_t
{
    LISTO,
    EMERGENCIA,
    ESPERA_REARME,
    FALLA
};

const unsigned long DIRECCION = 0;
const uint8_t VERSION = 1;
const unsigned long TIEMPO_RESPUESTA_MS = 300;

Memoria memoria = {};
Estado estado = LISTO;
bool bomba = false;
bool ordenAntes = false;
unsigned long cambioOrden = 0;
unsigned long ultimoSegundo = 0;

// Los últimos 3 arranques, para limitar los arranques por minuto.
const uint8_t MAX_ARRANQUES = 3;
const unsigned long VENTANA_MS = 60000;
unsigned long arranques[MAX_ARRANQUES] = {};
uint8_t cantidadArranques = 0;
bool marchaAntes = false;

// ¿Se puede arrancar? Con 3 arranques en la ventana, no.
bool arranquePermitido()
{
    if (cantidadArranques < MAX_ARRANQUES)
        return true;
    return millis() - arranques[0] >= VENTANA_MS;
}

void anotarArranque()
{
    if (cantidadArranques == MAX_ARRANQUES)
    {
        for (uint8_t k = 1; k < MAX_ARRANQUES; k++)
            arranques[k - 1] = arranques[k];
        cantidadArranques = MAX_ARRANQUES - 1;
    }
    arranques[cantidadArranques] = millis();
    cantidadArranques = cantidadArranques + 1;
}

String hora()
{
    char texto[10];
    snprintf(texto, sizeof(texto), "%02u:%02u:%02u", JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
    return String(texto);
}

void evento(String texto)
{
    Serial.printf("%s %s\n", hora().c_str(), texto.c_str());
}

void irA(Estado nuevo, String texto)
{
    estado = nuevo;
    bomba = false;
    evento(texto);
}

// Emergencia, térmico y realimentación: decide el estado.
void vigilar(bool setaSuelta, bool termicoBien, bool cerrado, bool rearme)
{
    if (!setaSuelta && estado != EMERGENCIA)
        irA(EMERGENCIA, "EMERGENCIA");
    if (setaSuelta && estado == EMERGENCIA)
        irA(ESPERA_REARME, "Emergencia liberada: apriete Rearme");

    if (!termicoBien && (estado == LISTO))
        irA(FALLA, "Falla: térmico F1");

    bool vencido = millis() - cambioOrden >= TIEMPO_RESPUESTA_MS;
    if (vencido && bomba && !cerrado && estado == LISTO)
        irA(FALLA, "Falla: KM1 no cierra");

    if (rearme && estado == ESPERA_REARME)
        irA(LISTO, "Rearmado");
    if (rearme && estado == FALLA && termicoBien)
        irA(LISTO, "Falla reconocida");
}

void contarHoras()
{
    if (!bomba)
    {
        ultimoSegundo = millis();
        return;
    }
    if (millis() - ultimoSegundo < 1000)
        return;
    ultimoSegundo = ultimoSegundo + 1000;
    memoria.segundos = memoria.segundos + 1;
    JWPLC_FRAM.writeBlock(DIRECCION, memoria, VERSION);
}

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 57: tablero de bomba de pozo");
    if (!JWPLC_FRAM.readBlock(DIRECCION, memoria, VERSION))
    {
        memoria.segundos = 0;
        JWPLC_FRAM.writeBlock(DIRECCION, memoria, VERSION);
    }
    Serial.printf("Horómetro: %lu s de marcha\n", memoria.segundos);
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paradaSinApretar = digitalRead(I0_1) == HIGH;
    bool cerrado = digitalRead(I0_2) == HIGH;
    bool setaSuelta = digitalRead(I0_3) == HIGH;
    bool termicoBien = digitalRead(I0_4) == HIGH;
    bool rearme = digitalRead(I0_5) == HIGH;

    vigilar(setaSuelta, termicoBien, cerrado, rearme);

    // ---- La bomba, solo con el tablero LISTO y sin demasiados arranques.
    bool antes = bomba;
    bool pedido = marcha && !marchaAntes;
    marchaAntes = marcha;
    bool permitido = arranquePermitido();
    if (pedido && !bomba && estado == LISTO && !permitido)
        evento("Demasiados arranques: espere");
    bomba = estado == LISTO && ((marcha && permitido) || bomba) && paradaSinApretar;
    if (bomba && !antes)
    {
        anotarArranque();
        evento("Bomba en marcha");
    }
    if (!bomba && antes && estado == LISTO)
        evento("Bomba detenida");
    if (bomba != ordenAntes)
        cambioOrden = millis();
    ordenAntes = bomba;

    contarHoras();

    digitalWrite(Q0_0, bomba);
    digitalWrite(Q0_1, estado != LISTO);
    digitalWrite(Q0_2, bomba);
}
