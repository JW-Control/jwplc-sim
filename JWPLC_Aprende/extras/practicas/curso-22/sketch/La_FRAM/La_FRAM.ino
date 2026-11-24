// Curso JWPLC Basic · Lección 22 · La FRAM: un contador que sobrevive a un corte
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: un contador de piezas a la salida de una faja. El sensor B1
// (I0.0) da un pulso por cada pieza. Si se corta la energía, la cuenta no
// se pierde: vive en la FRAM, una memoria que no se borra al apagar.
//
// La FRAM del equipo está en el objeto JWPLC_FRAM (8 KB).

// Lo que se guarda va junto en un struct (lección 12): un solo bloque.
struct Contadores
{
    unsigned long piezas;
};

const unsigned long DIRECCION = 0;   // Dónde empieza el bloque en la FRAM.
const uint8_t VERSION = 1;           // Cambia si cambias el struct.

Contadores cuenta = {};
bool sensorAntes = false;

void guardar()
{
    JWPLC_FRAM.writeBlock(DIRECCION, cuenta, VERSION);
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 22: sensor de piezas I0.0, cuenta en la FRAM");

    // readBlock() devuelve false si el bloque no está o no es válido
    // (FRAM nueva, otra versión o datos dañados).
    if (JWPLC_FRAM.readBlock(DIRECCION, cuenta, VERSION))
    {
        Serial.printf("Recuperado: %lu piezas\n", cuenta.piezas);
    }
    else
    {
        cuenta.piezas = 0;
        guardar();
        Serial.println("FRAM nueva: contador en 0");
    }
}

void loop()
{
    bool sensor = digitalRead(I0_0) == HIGH;

    // Una pieza por cada flanco de subida (lección 07).
    if (sensor && !sensorAntes)
    {
        cuenta.piezas = cuenta.piezas + 1;
        guardar();   // Se guarda en el momento: un corte no pierde nada.
        Serial.printf("Piezas: %lu\n", cuenta.piezas);
    }
    sensorAntes = sensor;

    // ESC en la botonera pone el contador en 0.
    if (JWPLC_Buttons.pressed(BTN_ESC))
    {
        cuenta.piezas = 0;
        guardar();
        Serial.println("Contador en 0");
    }
}
