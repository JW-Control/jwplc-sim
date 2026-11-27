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

  (* R_TRIG da TRUE un solo ciclo cuando S1 pasa de suelto a apretado. *)
  APRIETA(CLK := S1);
  IF APRIETA.Q THEN
    H1 := NOT H1;  (* telerruptor: cada pulsación cambia la luz *)
  END_IF;

END_PROGRAM
