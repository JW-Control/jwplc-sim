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

  F_PIEZA(CLK := B1);
  IF F_PIEZA.Q AND KM1 THEN
    PIEZAS := PIEZAS + 1;
  END_IF;

  (* El turno: 3 lotes. Con el turno completo, S1 ya no empieza otro. *)
  TURNO := LOTES >= 3;
  IF S1 AND COMPLETO AND NOT TURNO THEN
    PIEZAS := 0;
  END_IF;

  (* Lotes de 4; cada lote que se completa suma uno (flanco de COMPLETO). *)
  COMPLETO := PIEZAS >= 4;
  F_LOTE(CLK := COMPLETO);
  IF F_LOTE.Q THEN
    LOTES := LOTES + 1;
  END_IF;

  KM1 := (KM1 OR S1) AND S0 AND NOT COMPLETO;
  H1 := COMPLETO;

END_PROGRAM
