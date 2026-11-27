/*
  A_Config.h · Datos del proyecto y tiempos fijos

  QUÉ VA AQUÍ:    el nombre del proyecto y las constantes que no cambian
                  con la máquina en marcha (tiempos, límites).
  QUÉ NO VA AQUÍ: variables que cambian durante el ciclo (van en B_Tags.h).
*/
#pragma once

#define PROYECTO_NOMBRE "Lección 16: motor en pestañas"

const uint32_t SERIAL_BAUDIOS = 115200;
const uint32_t T_AVISO_ARRANQUE_MS = 2000;  // la sirena suena antes de arrancar
