/*
  C_Entradas · Leer las entradas

  QUÉ VA AQUÍ:    la lectura de los bornes, una sola vez por ciclo, y la
                  inversión de los contactos NC.
  QUÉ NO VA AQUÍ: decisiones de la máquina (van en D_Logica).
*/

void leerEntradas()
{
    // Las 8 entradas de una vez, como en la lección 05.
    imagenEntradas = digitalReadBlock(I0_X);

    pbMarcha = bitRead(imagenEntradas, BIT_PB_MARCHA);
    pbParo = !bitRead(imagenEntradas, BIT_PB_PARO);         // NC: abierto = apretado
    fallaTermico = !bitRead(imagenEntradas, BIT_TERMICO);   // NC: abierto = disparado
}
