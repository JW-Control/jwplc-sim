// Curso JWPLC Basic · Lección 16 · El programa en pestañas
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Esta pestaña solo dice el ORDEN del ciclo, como en la plantilla de
// proyecto JWPLC. Cada trabajo está en su pestaña:
//
//   A_Config.h       datos del proyecto y tiempos fijos
//   B_Tags.h         nombres de las E/S y variables globales
//   C_Entradas       leer las entradas
//   D_Logica         decidir qué hacer
//   F_Salidas        escribir las salidas
//   J_Diagnostico    mensajes por el Monitor Serie
//   K_Utilidades.h   TON, TOF y Flanco (no se edita)

#include "A_Config.h"
#include "K_Utilidades.h"
#include "B_Tags.h"

void setup()
{
    diagnosticoInicio();  // J
    salidasApagarTodo();  // F: arrancar siempre con las salidas apagadas
}

// Un ciclo de scan, como en un PLC: leer, decidir, escribir.
void loop()
{
    leerEntradas();       // C
    ejecutarLogica();     // D
    escribirSalidas();    // F
    diagnosticoCiclo();   // J
}
