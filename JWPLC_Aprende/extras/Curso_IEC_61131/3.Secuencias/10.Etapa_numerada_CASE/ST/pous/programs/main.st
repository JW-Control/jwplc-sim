PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha, NA *)
    S0 AT %IX0.1  : BOOL; (* parada, NC: TRUE sin pulsar *)
    KM1 AT %QX0.0 : BOOL; (* línea *)
    KM2 AT %QX0.1 : BOOL; (* estrella *)
    KM3 AT %QX0.2 : BOOL; (* triángulo *)
    H1 AT %QX0.3  : BOOL; (* piloto en marcha *)
    ETAPA         : INT; (* 0 parado, 1 estrella, 2 pausa, 3 triángulo *)
    T_EST         : TON;
    T_PAU         : TON;
    FIN_EST       : BOOL;
    FIN_PAU       : BOOL;
  END_VAR

  (* Temporizador de la etapa 1 (estrella). *)
  T_EST(IN := ETAPA = 1, PT := T#3s);
  FIN_EST := T_EST.Q;

  (* CASE elige el bloque de la etapa actual: solo se revisan sus condiciones. *)
  CASE ETAPA OF
    0: (* PARADO: espera la marcha *)
      IF S1 AND S0 THEN
        ETAPA := 1;
      END_IF;
    1: (* ESTRELLA: 3 s *)
      IF FIN_EST THEN
        ETAPA := 2;
      END_IF;
  END_CASE;

  (* La parada manda en cualquier etapa (S0 es NC). *)
  IF NOT S0 THEN
    ETAPA := 0;
  END_IF;

  (* Salidas según la etapa. *)
  KM1 := ETAPA > 0;
  KM2 := ETAPA = 1;
  KM3 := ETAPA = 2;

END_PROGRAM
