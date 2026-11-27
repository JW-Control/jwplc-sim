PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha / lote nuevo, NA *)
    S0 AT %IX0.1  : BOOL; (* parada, NC: TRUE sin pulsar *)
    B1 AT %IX0.2  : BOOL; (* sensor de piezas *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* lote completo *)
    F_PIEZA       : R_TRIG;
    PIEZAS        : INT; (* piezas del lote *)
    COMPLETO      : BOOL; (* lote completo *)
    F_LOTE        : R_TRIG;
    LOTES         : INT; (* lotes completos en el turno *)
    TURNO         : BOOL; (* turno completo *)
  END_VAR

  (* Cada pieza cuenta una vez y solo con la cinta en marcha. *)
  F_PIEZA(CLK := B1);
  IF F_PIEZA.Q AND KM1 THEN
    PIEZAS := PIEZAS + 1;
  END_IF;

  (* S1 con el lote completo empieza uno nuevo. *)
  IF S1 AND COMPLETO THEN
    PIEZAS := 0;
  END_IF;

  COMPLETO := PIEZAS >= 3;

  (* La cinta: marcha, parada NC y para sola con el lote completo. *)
  KM1 := (KM1 OR S1) AND S0 AND NOT COMPLETO;
  H1 := COMPLETO;

END_PROGRAM
