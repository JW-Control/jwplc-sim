PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* abrir, NA *)
    S2 AT %IX0.1  : BOOL; (* cerrar, NA *)
    S0 AT %IX0.2  : BOOL; (* parada, NC: TRUE sin pulsar *)
    B1 AT %IX0.3  : BOOL; (* final: portón abierto *)
    B2 AT %IX0.4  : BOOL; (* final: portón cerrado *)
    B3 AT %IX0.5  : BOOL; (* barrera: obstáculo en el paso *)
    KM1 AT %QX0.0 : BOOL; (* motor: abrir *)
    KM2 AT %QX0.1 : BOOL; (* motor: cerrar *)
    H1 AT %QX0.2  : BOOL; (* baliza de movimiento *)
    ETAPA         : INT; (* 0 parado, 1 abriendo, 2 cerrando *)
  END_VAR

  (* CASE: cada etapa revisa solo sus transiciones. *)
  CASE ETAPA OF
    0: (* PARADO *)
      IF S1 AND NOT B1 THEN
        ETAPA := 1;
      ELSIF S2 AND NOT B2 THEN
        ETAPA := 2;
      END_IF;
    1: (* ABRIENDO: hasta el final B1 *)
      IF B1 THEN
        ETAPA := 0;
      END_IF;
    2: (* CERRANDO: hasta el final B2 *)
      IF B2 THEN
        ETAPA := 0;
      ELSIF B3 THEN
        (* Obstáculo: vuelve a abrir. *)
        ETAPA := 1;
      END_IF;
  END_CASE;

  (* La parada manda en cualquier etapa (S0 es NC). *)
  IF NOT S0 THEN
    ETAPA := 0;
  END_IF;

  (* Salidas: un solo sentido por etapa, nunca los dos a la vez. *)
  KM1 := ETAPA = 1;
  KM2 := ETAPA = 2;
  H1 := ETAPA > 0;

END_PROGRAM
