PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha bomba 1, NA *)
    S2 AT %IX0.1  : BOOL; (* parada bomba 1, NC *)
    S3 AT %IX0.2  : BOOL; (* marcha bomba 2, NA *)
    S4 AT %IX0.3  : BOOL; (* parada bomba 2, NC *)
    KM1 AT %QX0.0 : BOOL; (* bomba 1 *)
    KM2 AT %QX0.1 : BOOL; (* bomba 2 *)
    H1 AT %QX0.2  : BOOL; (* lámpara «Bombeando» *)
    BOMBA1        : MOTOR;
    BOMBA2        : MOTOR;
  END_VAR

  BOMBA1(MARCHA := S1, PARADA := S2);
  KM1 := BOMBA1.Q;

  (* Otra instancia del mismo bloque: la bomba 2 con sus pulsadores. *)
  BOMBA2(MARCHA := S3, PARADA := S4);
  KM2 := BOMBA2.Q;

  (* Se pregunta a cada instancia por su salida. *)
  H1 := BOMBA1.Q OR BOMBA2.Q;

END_PROGRAM
