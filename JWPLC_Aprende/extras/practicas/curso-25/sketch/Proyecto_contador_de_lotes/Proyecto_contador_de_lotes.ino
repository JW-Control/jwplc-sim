// Curso JWPLC Basic · Lección 25 · Proyecto: un contador de lotes con todo el equipo
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: al final de una cinta, el sensor B1 (I0.0) cuenta las piezas.
// Al juntar un lote, el empujador Y1 (Q0.0) lo manda a la caja, el buzzer
// da un pitido y el lote queda anotado en la microSD con fecha y hora.
// El tamaño del lote se ajusta con UP y DOWN; todo se guarda en la FRAM.
// La cinta KM1 (Q0.1) corre siempre.
//
// Junta lo de toda la unidad: botonera (19), buzzer (20), reloj (21),
// FRAM (22) y microSD (23).

const unsigned long EMPUJE_MS = 1000;
const unsigned long BORRADO_MS = 2000;   // ESC apretado este tiempo borra los contadores.
const unsigned long LOTE_MIN = 2;
const unsigned long LOTE_MAX = 20;
const char ARCHIVO[] = "/lotes.csv";

struct Contadores
{
    unsigned long lote;     // Piezas por lote (el ajuste).
    unsigned long piezas;   // Piezas del lote en curso.
    unsigned long lotes;    // Lotes completos.
};
const uint8_t VERSION = 1;

Contadores cuenta = {};
bool sensorAntes = false;
bool empujando = false;
unsigned long inicioEmpuje = 0;
unsigned long inicioEsc = 0;
bool escAntes = false;

void guardar()
{
    JWPLC_FRAM.writeBlock(0, cuenta, VERSION);
}

String fechaHora()
{
    char texto[20];
    snprintf(texto, sizeof(texto), "%04u-%02u-%02u %02u:%02u:%02u",
             JWPLC_Time.year(), JWPLC_Time.month(), JWPLC_Time.day(),
             JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
    return String(texto);
}

void registrar(String evento)
{
    if (!JWPLC_SD.isReady())
    {
        Serial.println("Sin microSD: no se registra");
        return;
    }
    JWPLCFile archivo = JWPLC_SD.open(ARCHIVO, FILE_APPEND);
    if (archivo)
    {
        archivo.printf("%s;%s\n", fechaHora().c_str(), evento.c_str());
        archivo.close();
    }
}

void loteCompleto()
{
    cuenta.lotes = cuenta.lotes + 1;
    Serial.printf("Lote %lu completo (%lu piezas)\n", cuenta.lotes, cuenta.piezas);
    registrar("Lote " + String(cuenta.lotes) + ";" + String(cuenta.piezas) + " piezas");
    cuenta.piezas = 0;
    guardar();

    empujando = true;
    inicioEmpuje = millis();
    JWPLC_Buzzer.beep(200);
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 25: sensor I0.0, empujador Q0.0, cinta Q0.1");

    if (!JWPLC_FRAM.readBlock(0, cuenta, VERSION))
    {
        cuenta.lote = 6;
        cuenta.piezas = 0;
        cuenta.lotes = 0;
        guardar();
        Serial.println("FRAM nueva: valores de fábrica");
    }
    Serial.printf("Lote de %lu · %lu piezas · %lu lotes\n", cuenta.lote, cuenta.piezas, cuenta.lotes);
}

void loop()
{
    // Contar piezas (flanco de subida del sensor).
    bool sensor = digitalRead(I0_0) == HIGH;
    if (sensor && !sensorAntes)
    {
        cuenta.piezas = cuenta.piezas + 1;
        guardar();
        Serial.printf("Pieza %lu de %lu\n", cuenta.piezas, cuenta.lote);
        if (cuenta.piezas >= cuenta.lote)
        {
            loteCompleto();
        }
    }
    sensorAntes = sensor;

    // Ajustar el tamaño del lote.
    if (JWPLC_Buttons.pressed(BTN_UP) && cuenta.lote < LOTE_MAX)
    {
        cuenta.lote = cuenta.lote + 1;
        guardar();
        Serial.printf("Lote de %lu\n", cuenta.lote);
    }
    if (JWPLC_Buttons.pressed(BTN_DOWN) && cuenta.lote > LOTE_MIN && cuenta.lote > cuenta.piezas + 1)
    {
        cuenta.lote = cuenta.lote - 1;
        guardar();
        Serial.printf("Lote de %lu\n", cuenta.lote);
    }

    // ESC apretado 2 segundos borra los contadores (un toque no hace nada).
    bool esc = JWPLC_Buttons.isDown(BTN_ESC);
    if (esc && !escAntes)
    {
        inicioEsc = millis();
    }
    if (esc && inicioEsc != 0 && millis() - inicioEsc >= BORRADO_MS)
    {
        inicioEsc = 0;   // Una sola vez por cada vez que se mantiene.
        cuenta.piezas = 0;
        cuenta.lotes = 0;
        guardar();
        registrar("Contadores en 0");
        Serial.println("Contadores en 0");
    }
    escAntes = esc;

    // El golpe del empujador.
    if (empujando && millis() - inicioEmpuje >= EMPUJE_MS)
    {
        empujando = false;
    }

    digitalWrite(Q0_0, empujando);
    digitalWrite(Q0_1, true);   // La cinta corre siempre en este ejemplo.
}
