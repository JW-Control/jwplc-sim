PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    S2 AT %IX0.1 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* piloto verde *)
    H2 AT %QX0.1 : BOOL; (* piloto amarillo *)
  END_VAR

  (* H1 encendido con S1 suelto: NOT invierte la entrada. *)
  H1 := NOT S1;

  (* S2 manda H2. *)
  H2 := S2;

END_PROGRAM
