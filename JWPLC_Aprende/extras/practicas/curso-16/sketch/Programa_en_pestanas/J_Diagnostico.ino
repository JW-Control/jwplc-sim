/*
  J_Diagnostico · Mensajes por el Monitor Serie

  QUÉ VA AQUÍ:    avisos para quien prueba o mantiene la máquina.
  QUÉ NO VA AQUÍ: lógica: si borras esta pestaña, la máquina funciona igual.
*/

void diagnosticoInicio()
{
    Serial.begin(SERIAL_BAUDIOS);
    Serial.println(PROYECTO_NOMBRE);
}

void diagnosticoCiclo()
{
    if (arranqueMotor.subida(motor))
    {
        Serial.println("Motor en marcha");
    }
    if (paradaMotor.bajada(motor))
    {
        Serial.println(fallaTermico ? "Motor detenido por el térmico" : "Motor detenido");
    }
}
