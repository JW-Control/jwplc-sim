PROGRAM main
  VAR
    SA1 AT %IX0.0 : BOOL; (* mano izquierda *)
    SA2 AT %IX0.1 : BOOL; (* mano derecha *)
    SA3 AT %IX0.2 : BOOL; (* tercera mano *)
    H1 AT %QX0.0  : BOOL; (* prensa *)
    H2 AT %QX0.1  : BOOL;
    H3 AT %QX0.2  : BOOL;
    H5 AT %QX0.4  : BOOL;
  END_VAR

  (* Prensa a tres manos. *)
  H1 := SA1 AND SA2 AND SA3;

  H2 := SA1 OR SA2;
  H3 := NOT SA1;

  (* H5: SA1 activa y SA2 inactiva. *)
  H5 := SA1 AND NOT SA2;

END_PROGRAM
