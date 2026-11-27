PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* botón del peatón *)
    SA1 AT %IX0.1 : BOOL; (* modo noche *)
    H1 AT %QX0.0  : BOOL; (* rojo *)
    H2 AT %QX0.1  : BOOL; (* amarillo *)
    H3 AT %QX0.2  : BOOL; (* verde *)
    H4 AT %QX0.3  : BOOL; (* verde peatonal *)
    X1            : BOOL; (* etapa VERDE *)
    X2            : BOOL; (* etapa AMARILLO *)
    X3            : BOOL; (* etapa ROJO *)
    T1            : BOOL; (* transición VERDE → AMARILLO *)
    T2            : BOOL; (* transición AMARILLO → ROJO *)
    T3            : BOOL; (* transición ROJO → VERDE *)
    ARRANQUE      : BOOL; (* solo en la primera vuelta *)
    INICIADO      : BOOL;
    PEATON        : BOOL; (* pedido del peatón *)
    PIDE          : BOOL; (* peatón o verde máximo *)
    T_VMIN        : TON;
    T_VMAX        : TON;
    T_AMA         : TON;
    T_ROJO        : TON;
    FIN_VMIN      : BOOL;
    FIN_VMAX      : BOOL;
    FIN_AMA       : BOOL;
    FIN_ROJO      : BOOL;
    T_ULT         : TON;
    ULTIMOS       : BOOL; (* últimos 3 s del rojo *)
    T_ON          : TON;
    T_OFF         : TON;
    ENCENDIDO     : BOOL;
    APAGADO       : BOOL;
    AMA_NORMAL    : BOOL;
  END_VAR

  (* Arranque: la primera vuelta del programa activa la etapa inicial. *)
  ARRANQUE := NOT INICIADO;
  INICIADO := TRUE;

  (* Cada etapa lleva su temporizador. *)
  T_VMIN(IN := X1, PT := T#10s);
  FIN_VMIN := T_VMIN.Q;
  T_VMAX(IN := X1, PT := T#30s);
  FIN_VMAX := T_VMAX.Q;
  T_AMA(IN := X2, PT := T#3s);
  FIN_AMA := T_AMA.Q;
  T_ROJO(IN := X3, PT := T#8s);
  FIN_ROJO := T_ROJO.Q;

  (* Transiciones: etapa activa Y condición cumplida. *)
  PIDE := PEATON OR FIN_VMAX;
  T1 := X1 AND PIDE AND FIN_VMIN;
  T2 := X2 AND FIN_AMA;
  T3 := X3 AND FIN_ROJO;

  (* Etapas: se activan con la transición que llega y se apagan con la que sale. *)
  X1 := (X1 OR T3 OR ARRANQUE) AND NOT T1;
  X2 := (X2 OR T1) AND NOT T2;
  X3 := (X3 OR T2) AND NOT T3;

  (* El pedido del peatón se recuerda hasta que se atiende. *)
  PEATON := (PEATON OR S1) AND NOT T2;

  (* Salidas: cada luz depende solo de su etapa. *)
  H1 := X3;
  H2 := X2;
  H3 := X1;
  H4 := X3;

END_PROGRAM
