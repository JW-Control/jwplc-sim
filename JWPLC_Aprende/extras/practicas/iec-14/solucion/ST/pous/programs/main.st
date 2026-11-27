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

  F_ENTRA(CLK := S1);
  F_SALE(CLK := S2);

  (* Capacidad 3, y la cuenta nunca sale de 0…3. *)
  IF F_ENTRA.Q AND AUTOS < 3 THEN
    AUTOS := AUTOS + 1;
  END_IF;
  IF F_SALE.Q AND AUTOS > 0 THEN
    AUTOS := AUTOS - 1;
  END_IF;

  LIBRES := 3 - AUTOS;
  H1 := LIBRES > 0;
  H2 := LIBRES = 0;

END_PROGRAM
