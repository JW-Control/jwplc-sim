PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    S2 AT %IX0.1 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* piloto verde *)
    H2 AT %QX0.1 : BOOL; (* piloto amarillo *)
  END_VAR

  (* H1 sigue a S1: encendido mientras el pulsador esté apretado. *)
  H1 := S1;

END_PROGRAM
