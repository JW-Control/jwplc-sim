PROGRAM main
  VAR
    B1 AT %IX0.0  : BOOL; (* sensor de piezas *)
    S1 AT %IX0.1  : BOOL; (* RESET *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* caja llena *)
    PIEZAS        : CTU;
    LLENA         : BOOL;
    CUENTA        : INT; (* piezas en la caja *)
  END_VAR

  (* Cajas de 24; RESET (S1) empieza una caja nueva. *)
  PIEZAS(CU := B1, R := S1, PV := 24);
  CUENTA := PIEZAS.CV;
  LLENA := PIEZAS.Q;

  KM1 := NOT LLENA;
  H1 := LLENA;

END_PROGRAM
