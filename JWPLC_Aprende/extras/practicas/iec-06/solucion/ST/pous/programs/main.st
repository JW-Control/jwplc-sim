PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* luz que cambia al apretar *)
    H2 AT %QX0.1 : BOOL; (* luz que cambia al soltar *)
    APRIETA      : R_TRIG;
    SUELTA       : F_TRIG;
    PULSO        : BOOL; (* un ciclo al apretar *)
    PULSO2       : BOOL; (* un ciclo al soltar *)
  END_VAR

  APRIETA(CLK := S1);
  IF APRIETA.Q THEN
    H1 := NOT H1;
  END_IF;

  (* F_TRIG: un ciclo cuando S1 se suelta. *)
  SUELTA(CLK := S1);
  IF SUELTA.Q THEN
    H2 := NOT H2;
  END_IF;

END_PROGRAM
