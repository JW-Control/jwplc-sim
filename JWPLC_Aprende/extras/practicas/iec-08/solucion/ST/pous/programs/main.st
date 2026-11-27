PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* piloto verde *)
    H2 AT %QX0.1 : BOOL; (* piloto amarillo *)
    H3 AT %QX0.2 : BOOL; (* piloto rojo *)
    T_ON         : TON;
    T_OFF        : TON;
    L_ON         : TON;
    L_OFF        : TON;
    ENCENDIDO    : BOOL;
    APAGADO      : BOOL;
    LENTO_ON     : BOOL;
    LENTO_OFF    : BOOL;
  END_VAR

  T_ON(IN := NOT APAGADO, PT := T#500ms);
  ENCENDIDO := T_ON.Q;
  T_OFF(IN := ENCENDIDO, PT := T#500ms);
  APAGADO := T_OFF.Q;
  H1 := ENCENDIDO;

  (* Otra intermitencia, lenta: 2 s y 2 s. *)
  L_ON(IN := NOT LENTO_OFF, PT := T#2s);
  LENTO_ON := L_ON.Q;
  L_OFF(IN := LENTO_ON, PT := T#2s);
  LENTO_OFF := L_OFF.Q;
  H3 := LENTO_ON;

  (* H2 sigue a S1 al instante: nada espera. *)
  H2 := S1;

END_PROGRAM
