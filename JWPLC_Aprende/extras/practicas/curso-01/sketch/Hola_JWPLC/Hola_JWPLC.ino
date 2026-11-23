// Curso JWPLC Basic · Lección 01 · Hola, JWPLC
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Una variable guarda un dato que puede cambiar. Su tipo dice qué guarda:
// uint32_t es un número entero sin signo (nunca negativo) de 32 bits, de 0 a
// 4 294 967 295. Sirve para contar mucho tiempo.
uint32_t segundos = 0;

// setup() se ejecuta UNA sola vez, justo después de encender o reiniciar el
// equipo. Aquí se prepara todo lo que el programa necesita.
void setup()
{
    // Abre la comunicación con la PC a 115200 baudios (bits por segundo).
    // El Monitor Serie debe estar a la misma velocidad para leer bien.
    Serial.begin(115200);

    // println() escribe el texto y salta a la línea siguiente.
    Serial.println("Hola, JWPLC");
    Serial.println("Este mensaje sale una sola vez, desde setup().");
}

// loop() se repite sin parar mientras el equipo esté encendido: cuando llega
// a la última línea, vuelve a empezar desde la primera.
void loop()
{
    // print() escribe sin saltar de línea; así el número queda al lado.
    Serial.print("Segundos encendido: ");
    Serial.println(segundos);

    // delay() detiene el programa la cantidad de milisegundos indicada.
    // 1000 milisegundos = 1 segundo.
    delay(1000);

    // Suma 1 a la variable. Es lo mismo que escribir: segundos = segundos + 1;
    segundos++;
}
