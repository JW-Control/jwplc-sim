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

  (* Dos TON en anillo: uno cuenta el tiempo apagado y el otro el
     encendido; al terminar el segundo, los dos vuelven a cero. *)
  T_ON(IN := NOT APAGADO, PT := T#500ms);
  ENCENDIDO := T_ON.Q;
  T_OFF(IN := ENCENDIDO, PT := T#500ms);
  APAGADO := T_OFF.Q;

  H1 := ENCENDIDO;

END_PROGRAM
