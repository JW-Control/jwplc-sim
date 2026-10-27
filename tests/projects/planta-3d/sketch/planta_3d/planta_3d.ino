// Planta 3D (G8): cinta, tanque, puerta automática y cilindro con el JWPLC Basic.
//   I0_0 S1 marcha (NA)        I0_1 S0 parada (NC: 1 = sin pulsar)
//   I0_2 B1 pieza al final de la cinta (inductivo en C1.sensorB)
//   I0_3 LH nivel alto         I0_4 LL nivel bajo
//   I0_5 BO puerta abierta     I0_6 BC puerta cerrada    I0_7 BF fotocelda (persona)
//   Q0_0 KM1 motor de la cinta      Q0_1 KM2 bomba
//   Q0_2 KM3 abrir puerta           Q0_3 KM4 cerrar puerta
//   Q0_4 Y1 A+ (cilindro sale)      Q0_5 Y1 A- (cilindro entra)
// La cinta marcha con S1 y para con S0; cada pieza que llega al final hace
// salir el cilindro (empuja la pieza) y la cinta sigue. La bomba mantiene el
// tanque entre los niveles bajo y alto. La puerta abre con una persona y
// cierra 3 s después de que se va.

static bool marcha = false;
static bool bomba = false;
static uint32_t tPersona = 0;
static bool hubo = false;   // hubo una persona desde el arranque
static uint32_t tCilindro = 0;
static bool empujando = false;

void setup()
{
  Serial.begin(115200);
  for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
  for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
  Serial.println("planta lista");
}

void loop()
{
  const uint32_t ahora = millis();
  // Cinta
  if (digitalRead(I0_0)) marcha = true;
  if (!digitalRead(I0_1)) marcha = false;
  digitalWrite(Q0_0, marcha);
  // Cilindro: pieza al final -> sale 1 s y vuelve
  if (digitalRead(I0_2) && !empujando) {
    empujando = true;
    tCilindro = ahora;
    Serial.println("pieza al final");
  }
  digitalWrite(Q0_4, empujando && ahora - tCilindro < 200);
  digitalWrite(Q0_5, empujando && ahora - tCilindro >= 1000 && ahora - tCilindro < 1200);
  if (empujando && ahora - tCilindro >= 1500) empujando = false;
  // Tanque: bomba entre nivel bajo y alto
  if (digitalRead(I0_4)) bomba = true;
  if (digitalRead(I0_3)) bomba = false;
  digitalWrite(Q0_1, bomba);
  // Puerta
  const bool persona = digitalRead(I0_7);
  if (persona) {
    tPersona = ahora;
    hubo = true;
  }
  const bool abrir = persona || (hubo && ahora - tPersona < 3000);
  digitalWrite(Q0_2, abrir && !digitalRead(I0_5));
  digitalWrite(Q0_3, !abrir && !digitalRead(I0_6));
  delay(5);
}
