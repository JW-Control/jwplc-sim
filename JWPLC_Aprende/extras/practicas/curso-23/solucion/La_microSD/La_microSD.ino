// Curso JWPLC Basic · Lección 23 · La microSD: un registro con fecha y hora
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: el motor de siempre (marcha, paro), pero ahora cada arranque
// y cada parada queda anotado en un archivo de la microSD, con fecha y hora.
// OK en la botonera muestra el registro por el Monitor Serie.
//
// La microSD del equipo está en el objeto JWPLC_SD; cada archivo abierto es
// un JWPLCFile.

const char ARCHIVO[] = "/registro.csv";

bool motor = false;
bool sinSD = false;

// Práctica: cuántas líneas tiene el registro (una por evento).
unsigned long contarEventos()
{
    JWPLCFile archivo = JWPLC_SD.open(ARCHIVO, FILE_READ);
    if (!archivo)
    {
        return 0;
    }
    unsigned long lineas = 0;
    while (archivo.available())
    {
        if (archivo.read() == '\n')
        {
            lineas = lineas + 1;
        }
    }
    archivo.close();
    return lineas;
}

// "2026-11-24 18:00:05": la fecha y la hora del RTC (lección 21).
String fechaHora()
{
    char texto[20];
    snprintf(texto, sizeof(texto), "%04u-%02u-%02u %02u:%02u:%02u",
             JWPLC_Time.year(), JWPLC_Time.month(), JWPLC_Time.day(),
             JWPLC_Time.hour(), JWPLC_Time.minute(), JWPLC_Time.second());
    return String(texto);
}

// Agrega una línea al final del archivo: «fecha hora;evento».
void registrar(String evento)
{
    if (!JWPLC_SD.isReady())
    {
        if (!sinSD)
        {
            sinSD = true;
            Serial.println("Sin microSD: no se registra");
        }
        return;
    }
    sinSD = false;

    // FILE_APPEND: abre para escribir al final, sin borrar lo anterior.
    JWPLCFile archivo = JWPLC_SD.open(ARCHIVO, FILE_APPEND);
    if (!archivo)
    {
        Serial.println("No se pudo abrir el registro");
        return;
    }
    archivo.printf("%s;%s\n", fechaHora().c_str(), evento.c_str());
    archivo.close();   // Cerrar: así lo escrito queda guardado en la tarjeta.
    Serial.printf("Registrado: %s;%s\n", fechaHora().c_str(), evento.c_str());
}

// Copia el archivo entero al Monitor Serie.
void mostrarRegistro()
{
    JWPLCFile archivo = JWPLC_SD.open(ARCHIVO, FILE_READ);
    if (!archivo)
    {
        Serial.println("Registro vacío");
        return;
    }
    Serial.println("--- registro.csv ---");
    while (archivo.available())
    {
        Serial.write(archivo.read());
    }
    archivo.close();
    Serial.println("--- fin ---");
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 23: marcha I0.0, paro NC I0.1, motor Q0.0, registro en la microSD");
    if (JWPLC_SD.isReady())
    {
        Serial.printf("Registro: %lu eventos\n", contarEventos());
    }
    registrar("Encendido");
}

void loop()
{
    bool marcha = digitalRead(I0_0) == HIGH;
    bool paro = digitalRead(I0_1) == LOW;   // NC

    if (marcha && !paro && !motor)
    {
        motor = true;
        registrar("Arranque");
    }
    if (paro && motor)
    {
        motor = false;
        registrar("Parada");
    }

    if (JWPLC_Buttons.pressed(BTN_OK))
    {
        mostrarRegistro();
    }

    digitalWrite(Q0_0, motor);
    // Práctica: sin microSD, H1 avisa; la máquina sigue trabajando.
    digitalWrite(Q0_1, !JWPLC_SD.isReady());
}
