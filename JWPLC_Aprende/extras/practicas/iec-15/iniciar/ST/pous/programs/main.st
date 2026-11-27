PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha, NA *)
    S2 AT %IX0.1  : BOOL; (* paro, NC: TRUE sin pulsar *)
    KM1 AT %QX0.0 : BOOL; (* motor *)
    H1 AT %QX0.1  : BOOL; (* mantenimiento *)
    T_SEG         : TON;
    PULSO         : BOOL; (* TRUE una vuelta por segundo de marcha *)
    SEGUNDOS      : INT; (* horómetro: segundos de marcha *)
  END_VAR

  (* Marcha y parada con enclavamiento. *)
  KM1 := (KM1 OR S1) AND S2;

  (* Un pulso por segundo de marcha: el TON se reinicia solo con su propia salida. *)
  T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
  PULSO := T_SEG.Q;

  (* El horómetro suma un segundo por pulso. *)
  IF PULSO THEN
    SEGUNDOS := SEGUNDOS + 1;
  END_IF;

  (* Mantenimiento a los 20 s de marcha (en una planta serían horas). *)
  H1 := SEGUNDOS >= 20;

END_PROGRAM
