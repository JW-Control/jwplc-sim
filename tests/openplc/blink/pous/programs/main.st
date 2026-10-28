PROGRAM main
  VAR
    Q0_0_OUT AT %QX0.0 : BOOL;
    Q0_1_OUT AT %QX0.1 : BOOL;
    I0_0_IN AT %IX0.0 : BOOL;
    T1 : TON;
    T2 : TON;
  END_VAR

  T1(IN := NOT T2.Q, PT := T#500ms);
  T2(IN := T1.Q, PT := T#500ms);
  Q0_0_OUT := T1.Q;
  Q0_1_OUT := I0_0_IN;

END_PROGRAM
