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

  (* Y: la prensa baja solo con las dos manos. *)
  H1 := SA1 AND SA2;

  (* O: H2 con cualquiera de las dos. *)
  H2 := SA1 OR SA2;

  (* NO: H3 encendido mientras SA1 está suelto. *)
  H3 := NOT SA1;

END_PROGRAM
