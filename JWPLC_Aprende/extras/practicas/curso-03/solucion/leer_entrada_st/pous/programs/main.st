PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL;
    S2 AT %IX0.1 : BOOL;
    H1 AT %QX0.0 : BOOL;
    H2 AT %QX0.1 : BOOL;
  END_VAR

  (* Lección 03 en IEC 61131-3: H1 encendido con S1 suelto; S2 manda H2. *)
  H1 := NOT S1;
  H2 := S2;

END_PROGRAM
