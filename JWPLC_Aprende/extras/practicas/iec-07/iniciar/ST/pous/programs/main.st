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

  (* CTU cuenta cada flanco de subida de CU; Q se activa al llegar a PV. *)
  PIEZAS(CU := B1, R := FALSE, PV := 10);
  CUENTA := PIEZAS.CV;
  LLENA := PIEZAS.Q;

  KM1 := NOT LLENA;  (* la cinta para con la caja llena *)
  H1 := LLENA;

END_PROGRAM
