// Ejercicio 10 · Secuencia electroneumática A+ B+ B- A- C+ D+ D- C- (ver ENUNCIADO.md)
//   I0_0  A0, final de carrera: cilindro A retraído      I0_1  A1: cilindro A extendido
//   I0_2  B0: cilindro B retraído                        I0_3  B1: cilindro B extendido
//   I0_4  C0: cilindro C retraído                        I0_5  C1: cilindro C extendido
//   I0_6  D0: cilindro D retraído                        I0_7  D1: cilindro D extendido
//   Q0_0  Y1, electroválvula 5/2 monoestable del cilindro A (Q0_1 Y2 → B, Q0_2 Y3 → C, Q0_3 Y4 → D)
//   Q0_4  H1, piloto verde: en marcha
//   Q0_5  H2, piloto amarillo: en pausa
//   Q0_6  H3, piloto rojo: falla
//   Botones del frente del JWPLC Basic: OK = Arranque, ESC = Pausa, LEFT = Reset.
//   Se leen con JWPLC_Buttons.pressed(BTN_OK), JWPLC_Buttons.pressed(BTN_ESC) y JWPLC_Buttons.pressed(BTN_LEFT).
#include <Arduino.h>

void setup()
{
    // Las entradas y salidas del JWPLC ya vienen configuradas: no hace falta pinMode.
}

void loop()
{
    // Escriba aquí su programa.
}
