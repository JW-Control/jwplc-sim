PROGRAM main
  VAR
    B1 AT %IX0.0     : BOOL; (* sensor de cajas *)
    KM1 AT %QX0.0    : BOOL; (* banda (bobina 00001 para la PC) *)
    CAJAS AT %MW0    : INT; (* holding 40001: cajas contadas *)
    P_MARCHA AT %MW1 : INT; (* holding 40002: pulsador remoto MARCHA *)
    P_PARO AT %MW2   : INT; (* holding 40003: pulsador remoto PARO *)
    P_CERO AT %MW3   : INT; (* holding 40004: pulsador remoto contador a cero *)
    F_CAJA           : R_TRIG;
  END_VAR

  F_CAJA(CLK := B1);
  IF F_CAJA.Q THEN
    CAJAS := CAJAS + 1;
  END_IF;

  IF P_MARCHA <> 0 THEN
    KM1 := TRUE;
    P_MARCHA := 0;
  END_IF;

  IF P_PARO <> 0 THEN
    KM1 := FALSE;
    P_PARO := 0;
  END_IF;

  (* Pulsador remoto CERO (40004): el contador vuelve a 0 y se acusa la orden. *)
  IF P_CERO <> 0 THEN
    CAJAS := 0;
    P_CERO := 0;
  END_IF;

END_PROGRAM
