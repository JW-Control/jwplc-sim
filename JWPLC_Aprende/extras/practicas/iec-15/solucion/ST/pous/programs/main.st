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

  (* A los 20 s el motor queda bloqueado hasta el mantenimiento. *)
  KM1 := (KM1 OR S1) AND S2 AND SEGUNDOS < 20;

  T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
  PULSO := T_SEG.Q;
  IF PULSO THEN
    SEGUNDOS := SEGUNDOS + 1;
  END_IF;

  (* Aviso a los 10 s: se puede programar el mantenimiento. *)
  H1 := SEGUNDOS >= 10;

END_PROGRAM
