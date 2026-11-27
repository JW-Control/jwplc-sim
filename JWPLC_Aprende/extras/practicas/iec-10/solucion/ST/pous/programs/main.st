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

  T_EST(IN := ETAPA = 1, PT := T#3s);
  FIN_EST := T_EST.Q;
  (* Pausa de 100 ms con los dos contactores abiertos. *)
  T_PAU(IN := ETAPA = 2, PT := T#100ms);
  FIN_PAU := T_PAU.Q;

  CASE ETAPA OF
    0: (* PARADO *)
      IF S1 AND S0 THEN
        ETAPA := 1;
      END_IF;
    1: (* ESTRELLA *)
      IF FIN_EST THEN
        ETAPA := 2;
      END_IF;
    2: (* PAUSA *)
      IF FIN_PAU THEN
        ETAPA := 3;
      END_IF;
  END_CASE;

  IF NOT S0 THEN
    ETAPA := 0;
  END_IF;

  KM1 := ETAPA > 0;
  KM2 := ETAPA = 1;
  KM3 := ETAPA = 3;
  H1 := ETAPA > 0;

END_PROGRAM
