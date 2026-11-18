[Arquitectura 03] Planta de tratamiento de agua
  Bomba de captación (KM1) → filtro de arena F1 → reservorio T2 por la válvula de servicio Y1; retrolavado
  por Y2 al desagüe cuando el presostato diferencial PDS marca el filtro colmatado. La dosificadora CL1 inyecta
  cloro en línea y el analizador AT1 (RS-485, dir. 4) da el residual: el JWPLC Basic lo regula a 1,0 mg/L.
  Recorrido: Ejecutar → S1 a «I» (Auto): filtra y dosifica → subir la turbidez o pulsar «COLMATAR» en F1:
  sube el ΔP, actúa PDS y viene el retrolavado de 25 s → vuelve a filtrar.
  Fallas para mostrar: clic en el cabezal de CL1 (descebada: el cloro cae, E10/E12) · AT1 «Sin muestra»
  (E13, deja de dosificar) · cortar el cable RS-485 · bajar el consumo de T2 hasta que se llene (para la planta).
