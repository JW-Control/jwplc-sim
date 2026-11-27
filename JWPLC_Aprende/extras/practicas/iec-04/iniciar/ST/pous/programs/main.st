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

  (* Set y reset: MARCHA pone KM1 en TRUE y ahí queda;
     PARADA o el térmico lo vuelven a FALSE. El reset va después: gana. *)
  IF MARCHA THEN
    KM1 := TRUE;
  END_IF;
  IF NOT PARADA OR NOT TERMICO THEN
    KM1 := FALSE;
  END_IF;

  H2 := KM1;

END_PROGRAM
