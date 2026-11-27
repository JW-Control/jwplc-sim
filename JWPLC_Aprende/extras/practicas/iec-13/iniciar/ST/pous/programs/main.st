PROGRAM main
  VAR
    B1 AT %IX0.0  : BOOL; (* sensor de piezas *)
    S1 AT %IX0.1  : BOOL; (* RESET *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* aviso *)
    PIEZAS        : CTU;
    CUENTA        : INT; (* piezas en la caja *)
  END_VAR

  (* El contador solo cuenta: PV no importa, las decisiones las toman las comparaciones. *)
  PIEZAS(CU := B1, R := S1, PV := 100);
  CUENTA := PIEZAS.CV;

  (* Comparar: el resultado es un BOOL. *)
  KM1 := CUENTA < 10;   (* la cinta sigue mientras falten piezas *)
  H1 := CUENTA >= 10;   (* caja llena *)

END_PROGRAM
