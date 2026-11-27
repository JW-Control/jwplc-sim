<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-4/16-proyecto-lotes-y-turno-en-una-cinta.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 16: Proyecto: lotes y turno en una cinta

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el del reto «Cinta transportadora con contador de lote» de JWPLC Sim

El proyecto junta la unidad: una cinta que arma **lotes**. Cada pieza suma en el lote; con el lote completo la cinta para y avisa; el operador retira la caja y empieza otro con S1. En la práctica se agrega una segunda cuenta encima de la primera: los **lotes del turno**.

## Qué vas a aprender

- A encadenar dos cuentas: piezas por lote y lotes por turno.
- A sumar en el flanco de una condición calculada (COMPLETO), no solo de una entrada.
- A ordenar el programa: contar, decidir, comparar y, al final, las salidas.

## Dos cuentas encadenadas

| Cuenta | Suma uno cuando | Se usa para |
|---|---|---|
| PIEZAS | pasa una pieza por B1, con la cinta en marcha | COMPLETO := PIEZAS >= 4 |
| LOTES | COMPLETO pasa de FALSE a TRUE | TURNO := LOTES >= 3 |

La segunda cuenta no mira un sensor: mira el **flanco de COMPLETO**, una variable del programa. Un R_TRIG (en Ladder, el contacto **^COMPLETO**) sirve igual con cualquier BOOL.

## El orden del programa

1. Contar las piezas.
2. Decidir si empieza un lote nuevo (S1 con el lote completo vuelve PIEZAS a 0).
3. Comparar: COMPLETO, TURNO.
4. Las salidas: la cinta y el piloto.

Con ese orden, todo lo que se decide en una vuelta se ve en las salidas de la misma vuelta.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha / lote nuevo, NA *)
    S0 AT %IX0.1  : BOOL; (* parada, NC: TRUE sin pulsar *)
    B1 AT %IX0.2  : BOOL; (* sensor de piezas *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* lote completo *)
    F_PIEZA       : R_TRIG;
    PIEZAS        : INT; (* piezas del lote *)
    COMPLETO      : BOOL; (* lote completo *)
    F_LOTE        : R_TRIG;
    LOTES         : INT; (* lotes completos en el turno *)
    TURNO         : BOOL; (* turno completo *)
  END_VAR

  (* Cada pieza cuenta una vez y solo con la cinta en marcha. *)
  F_PIEZA(CLK := B1);
  IF F_PIEZA.Q AND KM1 THEN
    PIEZAS := PIEZAS + 1;
  END_IF;

  (* S1 con el lote completo empieza uno nuevo. *)
  IF S1 AND COMPLETO THEN
    PIEZAS := 0;
  END_IF;

  COMPLETO := PIEZAS >= 3;

  (* La cinta: marcha, parada NC y para sola con el lote completo. *)
  KM1 := (KM1 OR S1) AND S0 AND NOT COMPLETO;
  H1 := COMPLETO;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 736 874" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 736px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M722.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M206 50H371"/><path d="M461 50H722.5"/><path d="M341 90H371"/><path d="M341 130H371"/><path d="M461 90H491"/><rect data-sig="I0_2" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_0" x="179" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M182 50H189M189 40V60M199 40V60M199 50H206"/><rect x="371" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 232)"><path stroke-width="3" d="M1.5 -8V120M710.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M206 50H371"/><path d="M449 50H710.5"/><path d="M341 90H371"/><path d="M449 90H479"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M182 50H189M189 40V60M199 40V60M199 50H206"/><rect x="371" y="14" width="78" height="100" rx="2"/></g><g transform="translate(6 398)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 588)"><path stroke-width="3" d="M1.5 8V160M557.5 8V160"/><path d="M214 50H304"/><path d="M328 50H418"/><path d="M446 50H557.5"/><path d="M3 50H23"/><path d="M27 50H72"/><path d="M96 50H141"/><path d="M25 51V142H72"/><path d="M96 142H143V51"/><path d="M145 50H190"/><rect data-sig="I0_0" x="69" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M72 50H79M79 40V60M89 40V60M89 50H96"/><rect data-sig="Q0_0" x="69" y="129" width="30" height="26" rx="4" stroke="none"/><path d="M72 142H79M79 132V152M89 132V152M89 142H96"/><rect data-sig="I0_1" x="187" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M190 50H197M197 40V60M207 40V60M207 50H214"/><path d="M304 50H311M311 40V60M321 40V60M321 50H328"/><path d="M313 58L319 42"/><rect data-sig="Q0_0" x="415" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M418 50H424M440 50H446"/><path d="M428 40Q422 50 428 60M436 40Q442 50 436 60"/></g><g transform="translate(6 778)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_1" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Una pieza más, con la cinta en marcha &#42;)</text><text x="80" y="54" text-anchor="middle" font-size="9">P</text><text x="80" y="32" text-anchor="middle" font-weight="600">B1</text><text x="194" y="32" text-anchor="middle" font-weight="600">KM1</text><text x="416" y="27" text-anchor="middle" font-weight="700">ADD</text><text x="375" y="53.5" text-anchor="start" font-size="9">EN</text><text x="375" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="375" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="457" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="457" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="337" y="94" text-anchor="end" font-weight="600">PIEZAS</text><text x="337" y="134" text-anchor="end" font-weight="600">1</text><text x="495" y="94" text-anchor="start" font-weight="600">PIEZAS</text></g><g transform="translate(6 232)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; S1 con el lote completo: lote nuevo &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">S1</text><text x="194" y="32" text-anchor="middle" font-weight="600">COMPLETO</text><text x="410" y="27" text-anchor="middle" font-weight="700">MOVE</text><text x="375" y="53.5" text-anchor="start" font-size="9">EN</text><text x="375" y="93.5" text-anchor="start" font-size="9">IN</text><text x="445" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="445" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="337" y="94" text-anchor="end" font-weight="600">0</text><text x="483" y="94" text-anchor="start" font-weight="600">PIEZAS</text></g><g transform="translate(6 398)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Lote completo: 3 piezas &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">GE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">PIEZAS</text><text x="109" y="134" text-anchor="end" font-weight="600">3</text><text x="267" y="94" text-anchor="start" font-weight="600">COMPLETO</text></g><g transform="translate(6 588)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; La cinta &#42;)</text><text x="84" y="32" text-anchor="middle" font-weight="600">S1</text><text x="84" y="124" text-anchor="middle" font-weight="600">KM1</text><text x="202" y="32" text-anchor="middle" font-weight="600">S0</text><text x="316" y="32" text-anchor="middle" font-weight="600">COMPLETO</text><text x="432" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 778)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Piloto de lote completo &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">COMPLETO</text><text x="196" y="32" text-anchor="middle" font-weight="600">H1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 16, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 736 1230" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 736px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M134 82H210"/><path d="M282 82H420"/><path d="M-56 194H20"/><path d="M-56 242H20"/><path d="M104 194H210"/><path d="M134 298H172V242H210"/><path d="M-56 378H20"/><path d="M-56 426H20"/><path d="M104 378H157V290H210"/><path d="M294 194H420"/><path d="M-56 538H20"/><path d="M-56 586H20"/><path d="M104 538H210"/><path d="M134 642H172V586H210"/><path d="M134 690H172V634H210"/><path d="M294 538H420"/><path d="M134 794H210"/><path d="M134 842H210"/><path d="M294 794H420"/><path d="M-56 954H20"/><path d="M-56 1002H20"/><path d="M104 954H210"/><path d="M134 1058H172V1002H210"/><path d="M-56 1138H20"/><path d="M92 1138H151V1050H210"/><path d="M294 954H420"/><path d="M324 1218H420"/><rect x="210" y="34" width="72" height="72" rx="2"/><rect x="22" y="66" width="128" height="32" rx="16"/><rect x="420" y="66" width="128" height="32" rx="16"/><rect x="210" y="146" width="84" height="168" rx="2"/><rect x="20" y="146" width="84" height="120" rx="2"/><rect x="-168" y="178" width="128" height="32" rx="16"/><rect x="-168" y="226" width="128" height="32" rx="16"/><rect x="22" y="282" width="128" height="32" rx="16"/><rect x="20" y="330" width="84" height="120" rx="2"/><rect x="-168" y="362" width="128" height="32" rx="16"/><rect x="-168" y="410" width="128" height="32" rx="16"/><rect x="420" y="178" width="128" height="32" rx="16"/><rect x="210" y="490" width="84" height="168" rx="2"/><rect x="20" y="490" width="84" height="120" rx="2"/><rect x="-168" y="522" width="128" height="32" rx="16"/><rect x="-168" y="570" width="128" height="32" rx="16"/><rect x="22" y="626" width="128" height="32" rx="16"/><rect x="22" y="674" width="128" height="32" rx="16"/><rect x="420" y="522" width="128" height="32" rx="16"/><rect x="210" y="746" width="84" height="120" rx="2"/><rect x="22" y="778" width="128" height="32" rx="16"/><rect x="22" y="826" width="128" height="32" rx="16"/><rect x="420" y="778" width="128" height="32" rx="16"/><rect x="210" y="906" width="84" height="168" rx="2"/><rect x="20" y="906" width="84" height="120" rx="2"/><rect x="-168" y="938" width="128" height="32" rx="16"/><rect x="-168" y="986" width="128" height="32" rx="16"/><rect x="22" y="1042" width="128" height="32" rx="16"/><rect x="20" y="1090" width="72" height="72" rx="2"/><rect x="-168" y="1122" width="128" height="32" rx="16"/><rect x="420" y="938" width="128" height="32" rx="16"/><rect x="212" y="1202" width="128" height="32" rx="16"/><rect x="420" y="1202" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="246" y="47" text-anchor="middle" font-weight="700">R&#95;TRIG</text><text x="246" y="29" text-anchor="middle" font-style="italic" opacity="0.8">F&#95;PIEZA</text><text x="214" y="85.5" text-anchor="start" font-size="9">CLK</text><text x="278" y="85.5" text-anchor="end" font-size="9">Q</text><text x="86" y="86" text-anchor="middle" font-weight="600">B1</text><text x="484" y="86" text-anchor="middle" font-weight="600">PIEZA</text><text x="252" y="159" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="197.5" text-anchor="start" font-size="9">G</text><text x="214" y="245.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="293.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="197.5" text-anchor="end" font-size="9">OUT</text><text x="62" y="159" text-anchor="middle" font-weight="700">AND</text><text x="24" y="197.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="245.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="197.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="198" text-anchor="middle" font-weight="600">PIEZA</text><text x="-104" y="246" text-anchor="middle" font-weight="600">KM1</text><text x="86" y="302" text-anchor="middle" font-weight="600">PIEZAS</text><text x="62" y="343" text-anchor="middle" font-weight="700">ADD</text><text x="24" y="381.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="429.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="381.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="382" text-anchor="middle" font-weight="600">PIEZAS</text><text x="-104" y="430" text-anchor="middle" font-weight="600">1</text><text x="484" y="198" text-anchor="middle" font-weight="600">PIEZAS</text><text x="252" y="503" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="541.5" text-anchor="start" font-size="9">G</text><text x="214" y="589.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="637.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="541.5" text-anchor="end" font-size="9">OUT</text><text x="62" y="503" text-anchor="middle" font-weight="700">AND</text><text x="24" y="541.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="589.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="541.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="542" text-anchor="middle" font-weight="600">S1</text><text x="-104" y="590" text-anchor="middle" font-weight="600">COMPLETO</text><text x="86" y="646" text-anchor="middle" font-weight="600">PIEZAS</text><text x="86" y="694" text-anchor="middle" font-weight="600">0</text><text x="484" y="542" text-anchor="middle" font-weight="600">PIEZAS</text><text x="252" y="759" text-anchor="middle" font-weight="700">GE</text><text x="214" y="797.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="845.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="797.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="798" text-anchor="middle" font-weight="600">PIEZAS</text><text x="86" y="846" text-anchor="middle" font-weight="600">3</text><text x="484" y="798" text-anchor="middle" font-weight="600">COMPLETO</text><text x="252" y="919" text-anchor="middle" font-weight="700">AND</text><text x="214" y="957.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="1005.5" text-anchor="start" font-size="9">IN2</text><text x="214" y="1053.5" text-anchor="start" font-size="9">IN3</text><text x="290" y="957.5" text-anchor="end" font-size="9">OUT</text><text x="62" y="919" text-anchor="middle" font-weight="700">OR</text><text x="24" y="957.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="1005.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="957.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="958" text-anchor="middle" font-weight="600">KM1</text><text x="-104" y="1006" text-anchor="middle" font-weight="600">S1</text><text x="86" y="1062" text-anchor="middle" font-weight="600">S0</text><text x="56" y="1103" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="1141.5" text-anchor="start" font-size="9">IN</text><text x="88" y="1141.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="1142" text-anchor="middle" font-weight="600">COMPLETO</text><text x="484" y="958" text-anchor="middle" font-weight="600">KM1</text><text x="276" y="1222" text-anchor="middle" font-weight="600">COMPLETO</text><text x="484" y="1222" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 16: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

`IF F_PIEZA.Q AND KM1` cuenta solo con la cinta en marcha: una pieza que se mueve con la cinta parada no es parte del lote. `IF S1 AND COMPLETO THEN PIEZAS := 0` es el lote nuevo; en Ladder es un **MOVE** de 0 a PIEZAS, y en FBD un **SEL** que elige 0. Como COMPLETO se calcula después, en la misma vuelta ya vale FALSE y la cinta arranca.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: la cinta marcha.
2. Toca **B1** tres veces: el lote se completa, la cinta para y H1 se enciende.
3. **S1** empieza un lote nuevo.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Lotes de 4 piezas y un turno de 3 lotes: con el turno completo, S1 ya no empieza otro lote.**

1. Ejecuta el ejemplo: S1 arranca, cada toque a B1 es una pieza y con 3 la cinta para; S1 empieza otro lote.
2. Cambia el lote a 4 piezas.
3. Cuenta los lotes completos (LOTES, en el flanco de COMPLETO) y calcula TURNO := LOTES >= 3.
4. Con el turno completo, S1 no vuelve a cero las piezas: la cinta queda parada y H1 encendido.

> [!TIP] Qué te llevas
> Dos cuentas encadenadas (piezas por lote y lotes por turno) se arman con sumas en el flanco del evento y comparaciones; cada comparación es una condición más de la lógica.
