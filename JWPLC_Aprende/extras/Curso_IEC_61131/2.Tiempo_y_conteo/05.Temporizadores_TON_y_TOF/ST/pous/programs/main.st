PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* arranque *)
    B1 AT %IX0.1  : BOOL; (* presencia (selector) *)
    H1 AT %QX0.0  : BOOL; (* arranque *)
    H2 AT %QX0.1  : BOOL; (* luz del pasillo *)
    HA1 AT %QX0.2 : BOOL; (* bocina *)
    ARRANQUE      : TON;
    PASILLO       : TOF;
    BOCINA        : TON;
  END_VAR

  (* TON: H1 se enciende cuando S1 lleva 3 s apretado. *)
  ARRANQUE(IN := S1, PT := T#3s);
  H1 := ARRANQUE.Q;

  (* TOF: la luz del pasillo sigue 10 s después de la última presencia. *)
  PASILLO(IN := B1, PT := T#10s);
  H2 := PASILLO.Q;

END_PROGRAM
