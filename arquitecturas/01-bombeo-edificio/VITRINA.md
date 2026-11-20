[Arquitectura 01] Bombeo de edificio a presión constante
  Dos bombas con variador de frecuencia (Modbus RTU, dir. 1 y 2) y un transmisor de presión RS-485 (dir. 3)
  mantienen la red del edificio a 4,0 bar. El JWPLC Basic hace el PI, alterna las bombas y protege la cisterna.
  Recorrido: Ejecutar → girar S1 a «I» (Auto) → subir el consumo de RED1 (arrastre en el símbolo) a 180 L/min:
  entra la bomba de apoyo; bajarlo a 5 L/min: duerme y alterna la líder.
  Fallas para mostrar: STOP en el teclado de VF1 (no confirma marcha: E1M y entra B2) · PT1 «Sensor abierto» (E02, para todo)
  · cortar el cable RS-485 (E02/E1C) · bajar la cisterna T1 (flotador LS1: E01, protección en seco).
