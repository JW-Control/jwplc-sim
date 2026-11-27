// Curso JWPLC Basic · Lección 55 · Recetas: una máquina, varios productos
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una mezcladora que hace tres productos. Cada producto es una
// RECETA: un nombre y sus tiempos. El programa es el mismo; cambian los
// números. Sin recetas, cambiar de producto sería cambiar el programa.
//
// Las recetas van en una tabla de structs (lecciones 12 y 13):
//   UP y DOWN eligen la receta con la máquina parada
//   S1 (I0.0) arranca el ciclo: mezcla con KM1 (Q0.0) y reposo
//   H1 (Q0.1) se enciende con el producto listo

struct Receta
{
    char nombre[10];
    unsigned long mezclaMs;
    unsigned long reposoMs;
};

const Receta RECETAS[] = {
    {"YOGUR", 4000, 2000},
    {"CREMA", 6000, 1000},
    {"BATIDO", 3000, 0},
};
const uint8_t CANTIDAD = sizeof(RECETAS) / sizeof(RECETAS[0]);

enum Paso : uint8_t
{
    PARADA,
    MEZCLA,
    REPOSO,
    LISTO
};

uint8_t elegida = 0;
Paso paso = PARADA;
unsigned long inicioPaso = 0;
bool marchaAntes = false;

void mostrarReceta()
{
    Receta r = RECETAS[elegida];
    Serial.printf("Receta %d: %s · mezcla %lu s · reposo %lu s\n", elegida + 1, r.nombre, r.mezclaMs / 1000, r.reposoMs / 1000);
}

void irA(Paso nuevo)
{
    paso = nuevo;
    inicioPaso = millis();
}

void setup()
{
    Serial.begin(115200);
    JWPLC_Buttons.clearPendingInput();
    Serial.println("Lección 55: recetas con UP/DOWN, marcha I0.0, mezcla KM1 Q0.0, listo H1 Q0.1");
    mostrarReceta();
}

void loop()
{
    // ---- Elegir receta, solo con la máquina parada o lista.
    bool libre = paso == PARADA || paso == LISTO;
    if (libre && JWPLC_Buttons.pressed(BTN_UP))
    {
        elegida = (elegida + 1) % CANTIDAD;
        mostrarReceta();
    }
    if (libre && JWPLC_Buttons.pressed(BTN_DOWN))
    {
        elegida = (elegida + CANTIDAD - 1) % CANTIDAD;
        mostrarReceta();
    }

    // ---- El ciclo de la receta elegida (máquina de estados, lección 11).
    bool marcha = digitalRead(I0_0) == HIGH;
    Receta r = RECETAS[elegida];
    if (marcha && !marchaAntes && libre)
    {
        Serial.printf("Ciclo de %s\n", r.nombre);
        irA(MEZCLA);
    }
    marchaAntes = marcha;

    if (paso == MEZCLA && millis() - inicioPaso >= r.mezclaMs)
        irA(REPOSO);
    if (paso == REPOSO && millis() - inicioPaso >= r.reposoMs)
    {
        irA(LISTO);
        Serial.printf("%s listo\n", r.nombre);
    }

    digitalWrite(Q0_0, paso == MEZCLA);
    digitalWrite(Q0_1, paso == LISTO);
}
