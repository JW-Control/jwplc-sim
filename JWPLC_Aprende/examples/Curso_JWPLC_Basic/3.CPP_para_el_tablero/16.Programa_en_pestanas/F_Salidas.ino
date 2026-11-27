/*
  F_Salidas · Escribir las salidas

  QUÉ VA AQUÍ:    la escritura de los bornes, una sola vez por ciclo, al
                  final.
  QUÉ NO VA AQUÍ: decisiones de la máquina (van en D_Logica).
*/

void salidasApagarTodo()
{
    imagenSalidas = 0;
    digitalWriteBlock(Q0_X, imagenSalidas);
}

void escribirSalidas()
{
    uint8_t nueva = 0;
    bitWrite(nueva, BIT_MOTOR, motor);
    bitWrite(nueva, BIT_LAMPARA_FALLA, lamparaFalla);

    // Solo se escribe si algo cambió.
    if (nueva != imagenSalidas)
    {
        imagenSalidas = nueva;
        digitalWriteBlock(Q0_X, imagenSalidas);
    }
}
