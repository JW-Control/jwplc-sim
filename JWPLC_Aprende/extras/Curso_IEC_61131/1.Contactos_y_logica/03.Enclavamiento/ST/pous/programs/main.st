PROGRAM main
  VAR
    MARCHA AT %IX0.0  : BOOL; (* S1, pulsador NA *)
    PARADA AT %IX0.1  : BOOL; (* S2, pulsador NC: activa en reposo *)
    TERMICO AT %IX0.2 : BOOL; (* F1, contacto 95-96 NC: activo si no hay falla *)
    KM1 AT %QX0.0     : BOOL; (* contactor del motor *)
    H1 AT %QX0.1      : BOOL; (* piloto de falla *)
    H2 AT %QX0.2      : BOOL; (* piloto de marcha *)
  END_VAR

  (* El motor queda en marcha por su propio contacto (enclavamiento):
     MARCHA lo arranca, KM1 lo mantiene; PARADA o el térmico lo sueltan. *)
  KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;

END_PROGRAM
