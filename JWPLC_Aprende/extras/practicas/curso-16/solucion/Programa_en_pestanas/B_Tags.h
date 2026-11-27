/*
  B_Tags.h · Nombres de las E/S y variables globales

  QUÉ VA AQUÍ:    qué bit de las entradas y salidas usa cada equipo, y las
                  variables que comparten las pestañas.
  QUÉ NO VA AQUÍ: lógica ni lecturas de bornes.

  Si cambias un cable de borne, se cambia aquí y en ningún otro lugar.
*/
#pragma once

// ---------------------------------------------------------------------------
// Entradas: bit de I0_X (bit 0 = I0.0 ... bit 7 = I0.7)
// ---------------------------------------------------------------------------
const uint8_t BIT_PB_MARCHA = 0;  // I0.0 pulsador de marcha (NA)
const uint8_t BIT_PB_PARO = 1;    // I0.1 pulsador de paro (NC)
const uint8_t BIT_TERMICO = 2;    // I0.2 contacto 95-96 del térmico (NC)

// ---------------------------------------------------------------------------
// Salidas: bit de Q0_X
// ---------------------------------------------------------------------------
const uint8_t BIT_MOTOR = 0;          // Q0.0 contactor del motor
const uint8_t BIT_LAMPARA_FALLA = 1;  // Q0.1 lámpara de falla
const uint8_t BIT_LAMPARA_MARCHA = 2; // Q0.2 lámpara de marcha
const uint8_t BIT_SIRENA = 3;         // Q0.3 sirena de aviso

// ---------------------------------------------------------------------------
// Variables del ciclo. Todas en positivo: true = pasa la cosa que dice el
// nombre (pbParo = true es "alguien aprieta el paro"), sin importar si el
// contacto es NA o NC. Eso se resuelve una sola vez, en C_Entradas.
// ---------------------------------------------------------------------------
bool pbMarcha = false;
bool pbParo = false;
bool fallaTermico = false;

bool ordenMarcha = false;  // pedida y sellada; el motor arranca tras el aviso
bool motor = false;
bool lamparaFalla = false;
bool lamparaMarcha = false;
bool sirena = false;

// Temporizadores (K_Utilidades.h): uno por uso.
TON tAviso;

// Imagen de las entradas y salidas (solo las usan C_Entradas y F_Salidas).
uint8_t imagenEntradas = 0;
uint8_t imagenSalidas = 0;

// Diagnóstico (J_Diagnostico): un flanco por cada uso.
Flanco arranqueMotor;
Flanco paradaMotor;
