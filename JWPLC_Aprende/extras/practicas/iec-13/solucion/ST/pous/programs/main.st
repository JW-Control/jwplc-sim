PROGRAM main
  VAR
    B1 AT %IX0.0  : BOOL; (* sensor de piezas *)
    S1 AT %IX0.1  : BOOL; (* RESET *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* aviso *)
    PIEZAS        : CTU;
    CUENTA        : INT; (* piezas en la caja *)
  END_VAR

  PIEZAS(CU := B1, R := S1, PV := 100);
  CUENTA := PIEZAS.CV;

  (* Cajas de 12; el aviso empieza 4 piezas antes. *)
  KM1 := CUENTA < 12;
  H1 := CUENTA >= 8;

END_PROGRAM
