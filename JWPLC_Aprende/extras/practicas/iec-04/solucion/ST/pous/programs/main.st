PROGRAM main
  VAR
    MARCHA AT %IX0.0  : BOOL; (* S1, pulsador NA *)
    PARADA AT %IX0.1  : BOOL; (* S2, pulsador NC *)
    TERMICO AT %IX0.2 : BOOL; (* F1, térmico NC *)
    KM1 AT %QX0.0     : BOOL; (* contactor del motor *)
    H1 AT %QX0.1      : BOOL; (* piloto de falla *)
    H2 AT %QX0.2      : BOOL; (* piloto de marcha *)
    FALLA             : BOOL; (* falla del térmico memorizada *)
    RS_KM1            : RS;
    SR_FALLA          : SR;
  END_VAR

  (* La falla se memoriza al abrirse el térmico y solo PARADA la
     reconoce, con el térmico ya rearmado. *)
  IF NOT TERMICO THEN
    FALLA := TRUE;
  END_IF;
  IF NOT PARADA AND TERMICO THEN
    FALLA := FALSE;
  END_IF;

  IF MARCHA AND NOT FALLA THEN
    KM1 := TRUE;
  END_IF;
  IF NOT PARADA OR NOT TERMICO THEN
    KM1 := FALSE;
  END_IF;

  H1 := FALLA;
  H2 := KM1;

END_PROGRAM
