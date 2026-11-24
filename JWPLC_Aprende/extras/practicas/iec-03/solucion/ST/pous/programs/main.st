PROGRAM main
  VAR
    MARCHA AT %IX0.0  : BOOL; (* S1, pulsador NA *)
    PARADA AT %IX0.1  : BOOL; (* S2, pulsador NC: activa en reposo *)
    TERMICO AT %IX0.2 : BOOL; (* F1, contacto 95-96 NC: activo si no hay falla *)
    KM1 AT %QX0.0     : BOOL; (* contactor del motor *)
    H1 AT %QX0.1      : BOOL; (* piloto de falla *)
    H2 AT %QX0.2      : BOOL; (* piloto de marcha *)
  END_VAR

  KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;

  (* Piloto de marcha. *)
  H2 := KM1;

  (* Piloto de falla: el contacto 95-96 se abrió. *)
  H1 := NOT TERMICO;

END_PROGRAM
