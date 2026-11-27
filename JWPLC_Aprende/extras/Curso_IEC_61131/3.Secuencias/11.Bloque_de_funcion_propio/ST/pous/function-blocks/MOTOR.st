FUNCTION_BLOCK MOTOR
  VAR_INPUT
    MARCHA : BOOL; (* pulsador NA *)
    PARADA : BOOL; (* pulsador NC: TRUE sin pulsar *)
  END_VAR
  VAR_OUTPUT
    Q : BOOL; (* en marcha *)
    ARRANQUES : INT; (* veces que arrancó *)
  END_VAR
  VAR
    FLANCO : R_TRIG;
  END_VAR

  (* Enclavamiento (lección 03): la parada manda. *)
  Q := (Q OR MARCHA) AND PARADA;

  (* Cada arranque suma uno (flanco de subida de Q). *)
  FLANCO(CLK := Q);
  IF FLANCO.Q THEN
    ARRANQUES := ARRANQUES + 1;
  END_IF;

END_FUNCTION_BLOCK
