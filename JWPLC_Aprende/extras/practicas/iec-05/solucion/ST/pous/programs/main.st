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

  ARRANQUE(IN := S1, PT := T#2s);
  H1 := ARRANQUE.Q;

  PASILLO(IN := B1, PT := T#5s);
  H2 := PASILLO.Q;

  (* Alarma de tiempo: presencia de más de 30 s. *)
  BOCINA(IN := B1, PT := T#30s);
  HA1 := BOCINA.Q;

END_PROGRAM
