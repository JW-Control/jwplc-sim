/*
  D_Logica · Decidir qué hacer

  QUÉ VA AQUÍ:    la lógica de la máquina: enclavamientos, secuencias y
                  temporizadores. Lee y escribe variables de B_Tags.h.
  QUÉ NO VA AQUÍ: digitalRead() ni digitalWrite(): los bornes se leen en
                  C_Entradas y se escriben en F_Salidas.
*/

void ejecutarLogica()
{
    // La marcha y parada de la lección 08, con nombres que se leen solos.
    motor = (pbMarcha || motor) && !pbParo && !fallaTermico;
    lamparaFalla = fallaTermico;
}
