[Arquitectura 02] Montacargas de 3 paradas
  Motor trifásico con inversión (KM1 sube, KM2 baja, enclavados), relé térmico, finales de piso SQ0-SQ2,
  puertas de piso con contacto (cadena SP) y celda de carga. Sobrerrecorrido (SQS/SQI) y parada de emergencia
  cableados en serie con las bobinas. El JWPLC Basic atiende las llamadas y para en el piso pedido.
  Recorrido: Ejecutar → pulsar «Llamar P2» (SB2): sube y para en P2 → «Llamar PB»: baja.
  Fallas para mostrar: abrir una puerta en marcha (clic en la puerta del pozo: E01, para) · clic en la carga
  (sobrecarga: E02, no arranca) · parada de emergencia ES · «FALLAS» › contactor KM1 soldado o SQ2 trabado
  (sobrerrecorrido: actúa SQS y el PLC marca E03). BTN_OK de la placa repone.
