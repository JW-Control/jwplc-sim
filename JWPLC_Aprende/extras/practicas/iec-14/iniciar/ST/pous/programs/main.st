PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* barrera de entrada: entra un auto *)
    S2 AT %IX0.1 : BOOL; (* barrera de salida: sale un auto *)
    H1 AT %QX0.0 : BOOL; (* verde: hay lugar *)
    H2 AT %QX0.1 : BOOL; (* amarillo: lleno *)
    F_ENTRA      : R_TRIG;
    F_SALE       : R_TRIG;
    AUTOS        : INT; (* autos adentro *)
    LIBRES       : INT; (* lugares libres *)
  END_VAR

  (* Un auto por flanco: si no, sumaría en cada vuelta mientras la barrera esté abierta. *)
  F_ENTRA(CLK := S1);
  F_SALE(CLK := S2);

  IF F_ENTRA.Q THEN
    AUTOS := AUTOS + 1;
  END_IF;
  IF F_SALE.Q THEN
    AUTOS := AUTOS - 1;
  END_IF;

  (* Capacidad: 5 lugares. *)
  LIBRES := 5 - AUTOS;
  H1 := LIBRES > 0;
  H2 := LIBRES <= 0;

END_PROGRAM
