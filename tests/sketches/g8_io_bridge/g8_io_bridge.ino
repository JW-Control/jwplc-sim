// G8 OIP_FUXA: cada salida copia su entrada (Q0_k = I0_k). El puente de E/S
// escribe las entradas como lo haría una planta 3D y lee las salidas.
void setup()
{
  Serial.begin(115200);
  for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
  for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
  Serial.println("listo");
}

void loop()
{
  for (uint8_t i = 0; i < 8; i++) digitalWrite(Q0_X[i], digitalRead(I0_X[i]));
  delay(5);
}
