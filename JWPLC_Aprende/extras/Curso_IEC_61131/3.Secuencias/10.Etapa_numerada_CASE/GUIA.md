<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-3/10-etapa-numerada-case-comparar-y-move.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 10: Etapa numerada: CASE, comparar y MOVE

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el del reto «Arranque estrella-triángulo» de JWPLC Sim

En la lección 09 cada etapa tenía su propio bit. Otra forma, muy usada, es guardar **el número de la etapa** en una variable entera: `ETAPA = 0` parado, `1` estrella, `2` triángulo. Así nunca hay dos etapas activas a la vez y agregar una etapa es agregar un número.

El ejemplo es un **arranque estrella-triángulo**: el motor arranca en estrella (KM1 y KM2) para que la corriente de arranque sea menor y, a los 3 s, pasa a triángulo (KM1 y KM3).

## Qué vas a aprender

- A guardar la etapa en una variable INT y a cambiarla con una asignación.
- CASE en ST: solo se revisan las condiciones de la etapa actual.
- En Ladder: un bloque EQ por etapa y un MOVE para pasar a la siguiente, con EN/ENO.
- En FBD: EQ para leer la etapa y SEL para escribirla.

## Un número en lugar de varios bits

| ETAPA | Nombre | KM1 | KM2 | KM3 |
|---|---|---|---|---|
| 0 | PARADO | | | |
| 1 | ESTRELLA | ✔ | ✔ | |
| 2 | TRIÁNGULO | ✔ | | ✔ |

## En ST: CASE

`CASE ETAPA OF` salta al bloque del número que tenga la etapa. Dentro de cada bloque va la transición: si se cumple la condición, se escribe el número siguiente.

```pascal
CASE ETAPA OF
  0: IF S1 AND S0 THEN ETAPA := 1; END_IF;
  1: IF FIN_EST THEN ETAPA := 2; END_IF;
END_CASE;
```

## En Ladder: comparar y MOVE

Ladder no tiene CASE. Se hace en dos pasos: primero un bloque **EQ** por etapa deja un bit (E0, E1, E2) en TRUE si `ETAPA` vale ese número; después, cada transición es un peldaño con los contactos de la etapa y su condición, que termina en un **MOVE** con el número siguiente. MOVE solo copia cuando le llega corriente a su entrada **EN**.

En el OpenPLC Editor, EQ y MOVE se conectan al riel por EN/ENO: en las propiedades del bloque marca **Execution control**.

## En FBD: SEL

`SEL(G, IN0, IN1)` entrega IN0 si G es FALSE e IN1 si G es TRUE. Con IN0 = ETAPA, la etapa queda igual hasta que la condición G pide la siguiente.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha, NA *)
    S0 AT %IX0.1  : BOOL; (* parada, NC: TRUE sin pulsar *)
    KM1 AT %QX0.0 : BOOL; (* línea *)
    KM2 AT %QX0.1 : BOOL; (* estrella *)
    KM3 AT %QX0.2 : BOOL; (* triángulo *)
    H1 AT %QX0.3  : BOOL; (* piloto en marcha *)
    ETAPA         : INT; (* 0 parado, 1 estrella, 2 pausa, 3 triángulo *)
    T_EST         : TON;
    T_PAU         : TON;
    FIN_EST       : BOOL;
    FIN_PAU       : BOOL;
  END_VAR

  (* Temporizador de la etapa 1 (estrella). *)
  T_EST(IN := ETAPA = 1, PT := T#3s);
  FIN_EST := T_EST.Q;

  (* CASE elige el bloque de la etapa actual: solo se revisan sus condiciones. *)
  CASE ETAPA OF
    0: (* PARADO: espera la marcha *)
      IF S1 AND S0 THEN
        ETAPA := 1;
      END_IF;
    1: (* ESTRELLA: 3 s *)
      IF FIN_EST THEN
        ETAPA := 2;
      END_IF;
  END_CASE;

  (* La parada manda en cualquier etapa (S0 es NC). *)
  IF NOT S0 THEN
    ETAPA := 0;
  END_IF;

  (* Salidas según la etapa. *)
  KM1 := ETAPA > 0;
  KM2 := ETAPA = 1;
  KM3 := ETAPA = 2;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 838 1564" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 838px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 214)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 402)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 608)"><path stroke-width="3" d="M1.5 -8V120M627.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H488"/><path d="M516 50H627.5"/><path d="M227 90H257"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="66" height="100" rx="2"/><path d="M488 50H494M510 50H516"/><path d="M498 40Q492 50 498 60M506 40Q512 50 506 60"/></g><g transform="translate(6 774)"><path stroke-width="3" d="M1.5 -8V120M824.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M206 50H296"/><path d="M320 50H485"/><path d="M563 50H824.5"/><path d="M455 90H485"/><path d="M563 90H593"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="I0_0" x="179" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M182 50H189M189 40V60M199 40V60M199 50H206"/><rect data-sig="I0_1" x="293" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M296 50H303M303 40V60M313 40V60M313 50H320"/><rect x="485" y="14" width="78" height="100" rx="2"/></g><g transform="translate(6 940)"><path stroke-width="3" d="M1.5 -8V120M710.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M206 50H371"/><path d="M449 50H710.5"/><path d="M341 90H371"/><path d="M449 90H479"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M182 50H189M189 40V60M199 40V60M199 50H206"/><rect x="371" y="14" width="78" height="100" rx="2"/></g><g transform="translate(6 1106)"><path stroke-width="3" d="M1.5 -8V120M596.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M335 50H596.5"/><path d="M227 90H257"/><path d="M335 90H365"/><rect data-sig="I0_1" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M77 58L83 42"/><rect x="257" y="14" width="78" height="100" rx="2"/></g><g transform="translate(6 1256)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M77 58L83 42"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 1362)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_1" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 1468)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_2" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; ¿En qué etapa está? &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">EQ</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">ETAPA</text><text x="109" y="134" text-anchor="end" font-weight="600">0</text><text x="267" y="94" text-anchor="start" font-weight="600">E0</text></g><g transform="translate(6 214)"><text x="188" y="27" text-anchor="middle" font-weight="700">EQ</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">ETAPA</text><text x="109" y="134" text-anchor="end" font-weight="600">1</text><text x="267" y="94" text-anchor="start" font-weight="600">E1</text></g><g transform="translate(6 402)"><text x="188" y="27" text-anchor="middle" font-weight="700">EQ</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">ETAPA</text><text x="109" y="134" text-anchor="end" font-weight="600">2</text><text x="267" y="94" text-anchor="start" font-weight="600">E2</text></g><g transform="translate(6 608)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Estrella: 3 s &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">E1</text><text x="290" y="27" text-anchor="middle" font-weight="700">TON</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;EST</text><text x="261" y="53.5" text-anchor="start" font-size="9">IN</text><text x="261" y="93.5" text-anchor="start" font-size="9">PT</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">ET</text><text x="502" y="32" text-anchor="middle" font-weight="600">FIN&#95;EST</text><text x="223" y="94" text-anchor="end" font-weight="600">T#3s</text></g><g transform="translate(6 774)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; PARADO → ESTRELLA con la marcha &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">E0</text><text x="194" y="32" text-anchor="middle" font-weight="600">S1</text><text x="308" y="32" text-anchor="middle" font-weight="600">S0</text><text x="524" y="27" text-anchor="middle" font-weight="700">MOVE</text><text x="489" y="53.5" text-anchor="start" font-size="9">EN</text><text x="489" y="93.5" text-anchor="start" font-size="9">IN</text><text x="559" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="559" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="451" y="94" text-anchor="end" font-weight="600">1</text><text x="597" y="94" text-anchor="start" font-weight="600">ETAPA</text></g><g transform="translate(6 940)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; ESTRELLA → TRIÁNGULO a los 3 s &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">E1</text><text x="194" y="32" text-anchor="middle" font-weight="600">FIN&#95;EST</text><text x="410" y="27" text-anchor="middle" font-weight="700">MOVE</text><text x="375" y="53.5" text-anchor="start" font-size="9">EN</text><text x="375" y="93.5" text-anchor="start" font-size="9">IN</text><text x="445" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="445" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="337" y="94" text-anchor="end" font-weight="600">2</text><text x="483" y="94" text-anchor="start" font-weight="600">ETAPA</text></g><g transform="translate(6 1106)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; La parada manda en cualquier etapa &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">S0</text><text x="296" y="27" text-anchor="middle" font-weight="700">MOVE</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN</text><text x="331" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="331" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">0</text><text x="369" y="94" text-anchor="start" font-weight="600">ETAPA</text></g><g transform="translate(6 1256)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Línea: en cualquier etapa menos la 0 &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">E0</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 1362)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Estrella &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">E1</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM2</text></g><g transform="translate(6 1468)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Triángulo &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">E2</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM3</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 10, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 0 736 1668" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 736px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M134 68H210"/><path d="M134 116H210"/><path d="M294 68H420"/><path d="M134 228H210"/><path d="M134 276H210"/><path d="M294 228H420"/><path d="M134 388H210"/><path d="M134 436H210"/><path d="M294 388H420"/><path d="M134 562H210"/><path d="M134 610H210"/><path d="M270 562H420"/><path d="M-56 722H20"/><path d="M-56 770H20"/><path d="M-56 818H20"/><path d="M104 722H210"/><path d="M134 874H172V770H210"/><path d="M134 922H172V818H210"/><path d="M294 722H420"/><path d="M-56 1026H20"/><path d="M-56 1074H20"/><path d="M104 1026H210"/><path d="M134 1130H172V1074H210"/><path d="M134 1178H172V1122H210"/><path d="M294 1026H420"/><path d="M-56 1282H20"/><path d="M92 1282H210"/><path d="M134 1338H172V1330H210"/><path d="M134 1386H172V1378H210"/><path d="M294 1282H420"/><path d="M134 1490H210"/><path d="M282 1490H420"/><path d="M324 1570H420"/><path d="M324 1642H420"/><rect x="210" y="20" width="84" height="120" rx="2"/><rect x="22" y="52" width="128" height="32" rx="16"/><rect x="22" y="100" width="128" height="32" rx="16"/><rect x="420" y="52" width="128" height="32" rx="16"/><rect x="210" y="180" width="84" height="120" rx="2"/><rect x="22" y="212" width="128" height="32" rx="16"/><rect x="22" y="260" width="128" height="32" rx="16"/><rect x="420" y="212" width="128" height="32" rx="16"/><rect x="210" y="340" width="84" height="120" rx="2"/><rect x="22" y="372" width="128" height="32" rx="16"/><rect x="22" y="420" width="128" height="32" rx="16"/><rect x="420" y="372" width="128" height="32" rx="16"/><rect x="210" y="514" width="60" height="120" rx="2"/><rect x="22" y="546" width="128" height="32" rx="16"/><rect x="22" y="594" width="128" height="32" rx="16"/><rect x="420" y="546" width="128" height="32" rx="16"/><rect x="210" y="674" width="84" height="168" rx="2"/><rect x="20" y="674" width="84" height="168" rx="2"/><rect x="-168" y="706" width="128" height="32" rx="16"/><rect x="-168" y="754" width="128" height="32" rx="16"/><rect x="-168" y="802" width="128" height="32" rx="16"/><rect x="22" y="858" width="128" height="32" rx="16"/><rect x="22" y="906" width="128" height="32" rx="16"/><rect x="420" y="706" width="128" height="32" rx="16"/><rect x="210" y="978" width="84" height="168" rx="2"/><rect x="20" y="978" width="84" height="120" rx="2"/><rect x="-168" y="1010" width="128" height="32" rx="16"/><rect x="-168" y="1058" width="128" height="32" rx="16"/><rect x="22" y="1114" width="128" height="32" rx="16"/><rect x="22" y="1162" width="128" height="32" rx="16"/><rect x="420" y="1010" width="128" height="32" rx="16"/><rect x="210" y="1234" width="84" height="168" rx="2"/><rect x="20" y="1234" width="72" height="72" rx="2"/><rect x="-168" y="1266" width="128" height="32" rx="16"/><rect x="22" y="1322" width="128" height="32" rx="16"/><rect x="22" y="1370" width="128" height="32" rx="16"/><rect x="420" y="1266" width="128" height="32" rx="16"/><rect x="210" y="1442" width="72" height="72" rx="2"/><rect x="22" y="1474" width="128" height="32" rx="16"/><rect x="420" y="1474" width="128" height="32" rx="16"/><rect x="212" y="1554" width="128" height="32" rx="16"/><rect x="420" y="1554" width="128" height="32" rx="16"/><rect x="212" y="1626" width="128" height="32" rx="16"/><rect x="420" y="1626" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="252" y="33" text-anchor="middle" font-weight="700">EQ</text><text x="214" y="71.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="119.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="71.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="72" text-anchor="middle" font-weight="600">ETAPA</text><text x="86" y="120" text-anchor="middle" font-weight="600">0</text><text x="484" y="72" text-anchor="middle" font-weight="600">E0</text><text x="252" y="193" text-anchor="middle" font-weight="700">EQ</text><text x="214" y="231.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="279.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="231.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="232" text-anchor="middle" font-weight="600">ETAPA</text><text x="86" y="280" text-anchor="middle" font-weight="600">1</text><text x="484" y="232" text-anchor="middle" font-weight="600">E1</text><text x="252" y="353" text-anchor="middle" font-weight="700">EQ</text><text x="214" y="391.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="439.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="391.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="392" text-anchor="middle" font-weight="600">ETAPA</text><text x="86" y="440" text-anchor="middle" font-weight="600">2</text><text x="484" y="392" text-anchor="middle" font-weight="600">E2</text><text x="240" y="527" text-anchor="middle" font-weight="700">TON</text><text x="240" y="509" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;EST</text><text x="214" y="565.5" text-anchor="start" font-size="9">IN</text><text x="214" y="613.5" text-anchor="start" font-size="9">PT</text><text x="266" y="565.5" text-anchor="end" font-size="9">Q</text><text x="266" y="613.5" text-anchor="end" font-size="9">ET</text><text x="86" y="566" text-anchor="middle" font-weight="600">E1</text><text x="86" y="614" text-anchor="middle" font-weight="600">T#3s</text><text x="484" y="566" text-anchor="middle" font-weight="600">FIN&#95;EST</text><text x="252" y="687" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="725.5" text-anchor="start" font-size="9">G</text><text x="214" y="773.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="821.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="725.5" text-anchor="end" font-size="9">OUT</text><text x="62" y="687" text-anchor="middle" font-weight="700">AND</text><text x="24" y="725.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="773.5" text-anchor="start" font-size="9">IN2</text><text x="24" y="821.5" text-anchor="start" font-size="9">IN3</text><text x="100" y="725.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="726" text-anchor="middle" font-weight="600">E0</text><text x="-104" y="774" text-anchor="middle" font-weight="600">S1</text><text x="-104" y="822" text-anchor="middle" font-weight="600">S0</text><text x="86" y="878" text-anchor="middle" font-weight="600">ETAPA</text><text x="86" y="926" text-anchor="middle" font-weight="600">1</text><text x="484" y="726" text-anchor="middle" font-weight="600">ETAPA</text><text x="252" y="991" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="1029.5" text-anchor="start" font-size="9">G</text><text x="214" y="1077.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="1125.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="1029.5" text-anchor="end" font-size="9">OUT</text><text x="62" y="991" text-anchor="middle" font-weight="700">AND</text><text x="24" y="1029.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="1077.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="1029.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="1030" text-anchor="middle" font-weight="600">E1</text><text x="-104" y="1078" text-anchor="middle" font-weight="600">FIN&#95;EST</text><text x="86" y="1134" text-anchor="middle" font-weight="600">ETAPA</text><text x="86" y="1182" text-anchor="middle" font-weight="600">2</text><text x="484" y="1030" text-anchor="middle" font-weight="600">ETAPA</text><text x="252" y="1247" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="1285.5" text-anchor="start" font-size="9">G</text><text x="214" y="1333.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="1381.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="1285.5" text-anchor="end" font-size="9">OUT</text><text x="56" y="1247" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="1285.5" text-anchor="start" font-size="9">IN</text><text x="88" y="1285.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="1286" text-anchor="middle" font-weight="600">S0</text><text x="86" y="1342" text-anchor="middle" font-weight="600">ETAPA</text><text x="86" y="1390" text-anchor="middle" font-weight="600">0</text><text x="484" y="1286" text-anchor="middle" font-weight="600">ETAPA</text><text x="246" y="1455" text-anchor="middle" font-weight="700">NOT</text><text x="214" y="1493.5" text-anchor="start" font-size="9">IN</text><text x="278" y="1493.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="1494" text-anchor="middle" font-weight="600">E0</text><text x="484" y="1494" text-anchor="middle" font-weight="600">KM1</text><text x="276" y="1574" text-anchor="middle" font-weight="600">E1</text><text x="484" y="1574" text-anchor="middle" font-weight="600">KM2</text><text x="276" y="1646" text-anchor="middle" font-weight="600">E2</text><text x="484" y="1646" text-anchor="middle" font-weight="600">KM3</text></g></svg>
<figcaption>FBD de la lección 10: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

La parada va **después** del CASE y manda sobre todo: con S0 pulsado (S0 es NC, así que vale FALSE), `ETAPA := 0` en cualquier etapa. Las salidas se calculan al final a partir de la etapa: `KM2 := ETAPA = 1;`.

En Ladder, los bits E0 a E2 se calculan al principio de cada vuelta, así que un cambio de etapa se ve en las salidas en la vuelta siguiente, 20 ms después.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: cierran KM1 y KM2 (estrella).
2. A los 3 s abre KM2 y cierra KM3 (triángulo).
3. Aprieta **S0**: abren los tres contactores.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Pausa de 100 ms con KM2 y KM3 abiertos entre estrella y triángulo, y piloto H1 (Q0.3) encendido en marcha.**

1. Ejecuta el ejemplo: con S1 cierran KM1 y KM2 (estrella) y a los 3 s pasa a KM3 (triángulo).
2. Agrega una etapa 2, PAUSA, de 100 ms con KM2 y KM3 abiertos; el triángulo pasa a ser la etapa 3.
3. Enciende H1 en cualquier etapa menos la 0.
4. Comprueba que S0 detiene todo en cualquier etapa.

> [!TIP] Qué te llevas
> Con un número de etapa, CASE (ST) o una comparación por etapa (Ladder y FBD) elige qué condiciones revisar, y MOVE o SEL escriben la etapa siguiente.
