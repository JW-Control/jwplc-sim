PROGRAM main
  VAR
    B1 AT %IX0.0   : BOOL; (* sensor de cajas *)
    KM1 AT %QX0.0  : BOOL; (* banda (bobina 00001 para la PC) *)
    CAJAS AT %MW0  : INT; (* holding 40001: cajas contadas *)
    MARCHA AT %MW1 : INT; (* holding 40002: marcha, la escribe la PC *)
    META AT %MW2   : INT; (* holding 40003: meta de cajas, la escribe la PC *)
    F_CAJA         : R_TRIG;
  END_VAR

  F_CAJA(CLK := B1);
  IF F_CAJA.Q THEN
    CAJAS := CAJAS + 1;
  END_IF;

  (* Meta desde la PC (40003): al llegar, el programa borra la marcha que escribió la PC. *)
  IF META > 0 AND CAJAS >= META THEN
    MARCHA := 0;
  END_IF;

  KM1 := MARCHA <> 0;

END_PROGRAM
