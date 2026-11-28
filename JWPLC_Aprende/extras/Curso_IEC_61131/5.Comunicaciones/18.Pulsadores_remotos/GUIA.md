<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-5/18-pulsadores-remotos-la-pc-pide-y-el-programa-acusa.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 18: Pulsadores remotos: la PC pide y el programa acusa

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 47 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/47-servidor-modbus-tcp/)

En la lección anterior la PC dejaba un valor fijo en el 40002 y la banda lo seguía. En planta, las órdenes de un SCADA casi nunca son así: son **pulsos**, como un botón. La PC escribe «quiero marcha», el PLC lo hace y le contesta «hecho». Esa respuesta es el **acuse**, y aquí sale gratis: el programa devuelve la orden a 0.

## Qué vas a aprender

- A recibir órdenes de la PC como pulsadores remotos en holding (%MW).
- A acusar una orden devolviéndola a 0 para que no se repita.
- A combinar las órdenes de la red con una memoria de marcha (Set/Reset).

## Una orden es un pulso

Si la PC deja un 1 fijo en una palabra, ¿cuándo se pulsó? ¿Ya se cumplió? Con el **acuse** no hay duda:

1. La PC escribe un valor distinto de 0 en el holding de la orden.
2. El programa lo ve, hace la orden **una vez** y escribe 0 en el mismo holding.
3. La PC vuelve a leer el holding: si está en 0, la orden se cumplió.

## El mapa de la banda

| Variable | Dirección | Para la PC | Quién escribe |
|---|---|---|---|
| `CAJAS` | `%MW0` | 40001 | el programa |
| `P_MARCHA` | `%MW1` | 40002 | la PC (pulso), el programa (acuse) |
| `P_PARO` | `%MW2` | 40003 | la PC (pulso), el programa (acuse) |
| `P_CERO` | `%MW3` | 40004 | la PC (pulso), el programa (acuse) |
| `KM1` | `%QX0.0` | bobina 00001 | el programa |

La banda ya no sigue a un valor: queda **encendida** con MARCHA y se **apaga** con PARO, como un arranque con pulsadores de la Unidad 1.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    B1 AT %IX0.0     : BOOL; (* sensor de cajas *)
    KM1 AT %QX0.0    : BOOL; (* banda (bobina 00001 para la PC) *)
    CAJAS AT %MW0    : INT; (* holding 40001: cajas contadas *)
    P_MARCHA AT %MW1 : INT; (* holding 40002: pulsador remoto MARCHA *)
    P_PARO AT %MW2   : INT; (* holding 40003: pulsador remoto PARO *)
    P_CERO AT %MW3   : INT; (* holding 40004: pulsador remoto contador a cero *)
    F_CAJA           : R_TRIG;
  END_VAR

  F_CAJA(CLK := B1);
  IF F_CAJA.Q THEN
    CAJAS := CAJAS + 1;
  END_IF;

  (* Pulsador remoto MARCHA (40002): la PC escribe un valor distinto de 0;
     el programa hace la orden y lo devuelve a 0: ese 0 es el acuse. *)
  IF P_MARCHA <> 0 THEN
    KM1 := TRUE;
    P_MARCHA := 0;
  END_IF;

  (* Pulsador remoto PARO (40003), con el mismo acuse. *)
  IF P_PARO <> 0 THEN
    KM1 := FALSE;
    P_PARO := 0;
  END_IF;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 622 1162" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 622px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M608.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M347 50H608.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M347 90H377"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 232)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 422)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 544)"><path stroke-width="3" d="M1.5 -8V120M596.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M335 50H596.5"/><path d="M227 90H257"/><path d="M335 90H365"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="78" height="100" rx="2"/></g><g transform="translate(6 710)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 900)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 1022)"><path stroke-width="3" d="M1.5 -8V120M596.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M335 50H596.5"/><path d="M227 90H257"/><path d="M335 90H365"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="78" height="100" rx="2"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Una caja más (40001) &#42;)</text><text x="80" y="54" text-anchor="middle" font-size="9">P</text><text x="80" y="32" text-anchor="middle" font-weight="600">B1</text><text x="302" y="27" text-anchor="middle" font-weight="700">ADD</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="261" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="343" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="343" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">CAJAS</text><text x="223" y="134" text-anchor="end" font-weight="600">1</text><text x="381" y="94" text-anchor="start" font-weight="600">CAJAS</text></g><g transform="translate(6 232)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; ¿La PC pulsó MARCHA? (40002 distinto de 0) &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">NE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">P&#95;MARCHA</text><text x="109" y="134" text-anchor="end" font-weight="600">0</text><text x="267" y="94" text-anchor="start" font-weight="600">O&#95;MARCHA</text></g><g transform="translate(6 422)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Marcha: la banda queda encendida &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">O&#95;MARCHA</text><text x="196" y="54" text-anchor="middle" font-size="9">S</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 544)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Acuse: el 40002 vuelve a 0 &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">O&#95;MARCHA</text><text x="296" y="27" text-anchor="middle" font-weight="700">MOVE</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN</text><text x="331" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="331" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">0</text><text x="369" y="94" text-anchor="start" font-weight="600">P&#95;MARCHA</text></g><g transform="translate(6 710)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; ¿La PC pulsó PARO? (40003 distinto de 0) &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">NE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">P&#95;PARO</text><text x="109" y="134" text-anchor="end" font-weight="600">0</text><text x="267" y="94" text-anchor="start" font-weight="600">O&#95;PARO</text></g><g transform="translate(6 900)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Paro: la banda se apaga &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">O&#95;PARO</text><text x="196" y="54" text-anchor="middle" font-size="9">R</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 1022)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Acuse: el 40003 vuelve a 0 &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">O&#95;PARO</text><text x="296" y="27" text-anchor="middle" font-weight="700">MOVE</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN</text><text x="331" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="331" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">0</text><text x="369" y="94" text-anchor="start" font-weight="600">P&#95;PARO</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 18, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 926 1278" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 926px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M324 82H400"/><path d="M472 82H610"/><path d="M324 194H400"/><path d="M324 242H400"/><path d="M134 322H210"/><path d="M134 370H210"/><path d="M294 322H347V290H400"/><path d="M484 194H610"/><path d="M134 482H210"/><path d="M-56 562H20"/><path d="M-56 610H20"/><path d="M104 562H157V530H210"/><path d="M294 482H400"/><path d="M134 698H210"/><path d="M134 746H210"/><path d="M294 698H347V530H400"/><path d="M484 482H610"/><path d="M134 858H210"/><path d="M134 906H210"/><path d="M294 858H400"/><path d="M324 962H362V906H400"/><path d="M324 1010H362V954H400"/><path d="M484 858H610"/><path d="M134 1114H210"/><path d="M134 1162H210"/><path d="M294 1114H400"/><path d="M324 1218H362V1162H400"/><path d="M324 1266H362V1210H400"/><path d="M484 1114H610"/><rect x="400" y="34" width="72" height="72" rx="2"/><rect x="212" y="66" width="128" height="32" rx="16"/><rect x="610" y="66" width="128" height="32" rx="16"/><rect x="400" y="146" width="84" height="168" rx="2"/><rect x="212" y="178" width="128" height="32" rx="16"/><rect x="212" y="226" width="128" height="32" rx="16"/><rect x="210" y="274" width="84" height="120" rx="2"/><rect x="22" y="306" width="128" height="32" rx="16"/><rect x="22" y="354" width="128" height="32" rx="16"/><rect x="610" y="178" width="128" height="32" rx="16"/><rect x="400" y="434" width="84" height="120" rx="2"/><rect x="210" y="434" width="84" height="120" rx="2"/><rect x="22" y="466" width="128" height="32" rx="16"/><rect x="20" y="514" width="84" height="120" rx="2"/><rect x="-168" y="546" width="128" height="32" rx="16"/><rect x="-168" y="594" width="128" height="32" rx="16"/><rect x="210" y="650" width="84" height="120" rx="2"/><rect x="22" y="682" width="128" height="32" rx="16"/><rect x="22" y="730" width="128" height="32" rx="16"/><rect x="610" y="466" width="128" height="32" rx="16"/><rect x="400" y="810" width="84" height="168" rx="2"/><rect x="210" y="810" width="84" height="120" rx="2"/><rect x="22" y="842" width="128" height="32" rx="16"/><rect x="22" y="890" width="128" height="32" rx="16"/><rect x="212" y="946" width="128" height="32" rx="16"/><rect x="212" y="994" width="128" height="32" rx="16"/><rect x="610" y="842" width="128" height="32" rx="16"/><rect x="400" y="1066" width="84" height="168" rx="2"/><rect x="210" y="1066" width="84" height="120" rx="2"/><rect x="22" y="1098" width="128" height="32" rx="16"/><rect x="22" y="1146" width="128" height="32" rx="16"/><rect x="212" y="1202" width="128" height="32" rx="16"/><rect x="212" y="1250" width="128" height="32" rx="16"/><rect x="610" y="1098" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="436" y="47" text-anchor="middle" font-weight="700">R&#95;TRIG</text><text x="436" y="29" text-anchor="middle" font-style="italic" opacity="0.8">F&#95;CAJA</text><text x="404" y="85.5" text-anchor="start" font-size="9">CLK</text><text x="468" y="85.5" text-anchor="end" font-size="9">Q</text><text x="276" y="86" text-anchor="middle" font-weight="600">B1</text><text x="674" y="86" text-anchor="middle" font-weight="600">CAJA</text><text x="442" y="159" text-anchor="middle" font-weight="700">SEL</text><text x="404" y="197.5" text-anchor="start" font-size="9">G</text><text x="404" y="245.5" text-anchor="start" font-size="9">IN0</text><text x="404" y="293.5" text-anchor="start" font-size="9">IN1</text><text x="480" y="197.5" text-anchor="end" font-size="9">OUT</text><text x="276" y="198" text-anchor="middle" font-weight="600">CAJA</text><text x="276" y="246" text-anchor="middle" font-weight="600">CAJAS</text><text x="252" y="287" text-anchor="middle" font-weight="700">ADD</text><text x="214" y="325.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="373.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="325.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="326" text-anchor="middle" font-weight="600">CAJAS</text><text x="86" y="374" text-anchor="middle" font-weight="600">1</text><text x="674" y="198" text-anchor="middle" font-weight="600">CAJAS</text><text x="442" y="447" text-anchor="middle" font-weight="700">AND</text><text x="404" y="485.5" text-anchor="start" font-size="9">IN1</text><text x="404" y="533.5" text-anchor="start" font-size="9">IN2</text><text x="480" y="485.5" text-anchor="end" font-size="9">OUT</text><text x="252" y="447" text-anchor="middle" font-weight="700">OR</text><text x="214" y="485.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="533.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="485.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="486" text-anchor="middle" font-weight="600">KM1</text><text x="62" y="527" text-anchor="middle" font-weight="700">NE</text><text x="24" y="565.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="613.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="565.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="566" text-anchor="middle" font-weight="600">P&#95;MARCHA</text><text x="-104" y="614" text-anchor="middle" font-weight="600">0</text><text x="252" y="663" text-anchor="middle" font-weight="700">EQ</text><text x="214" y="701.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="749.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="701.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="702" text-anchor="middle" font-weight="600">P&#95;PARO</text><text x="86" y="750" text-anchor="middle" font-weight="600">0</text><text x="674" y="486" text-anchor="middle" font-weight="600">KM1</text><text x="442" y="823" text-anchor="middle" font-weight="700">SEL</text><text x="404" y="861.5" text-anchor="start" font-size="9">G</text><text x="404" y="909.5" text-anchor="start" font-size="9">IN0</text><text x="404" y="957.5" text-anchor="start" font-size="9">IN1</text><text x="480" y="861.5" text-anchor="end" font-size="9">OUT</text><text x="252" y="823" text-anchor="middle" font-weight="700">NE</text><text x="214" y="861.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="909.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="861.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="862" text-anchor="middle" font-weight="600">P&#95;MARCHA</text><text x="86" y="910" text-anchor="middle" font-weight="600">0</text><text x="276" y="966" text-anchor="middle" font-weight="600">P&#95;MARCHA</text><text x="276" y="1014" text-anchor="middle" font-weight="600">0</text><text x="674" y="862" text-anchor="middle" font-weight="600">P&#95;MARCHA</text><text x="442" y="1079" text-anchor="middle" font-weight="700">SEL</text><text x="404" y="1117.5" text-anchor="start" font-size="9">G</text><text x="404" y="1165.5" text-anchor="start" font-size="9">IN0</text><text x="404" y="1213.5" text-anchor="start" font-size="9">IN1</text><text x="480" y="1117.5" text-anchor="end" font-size="9">OUT</text><text x="252" y="1079" text-anchor="middle" font-weight="700">NE</text><text x="214" y="1117.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="1165.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="1117.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="1118" text-anchor="middle" font-weight="600">P&#95;PARO</text><text x="86" y="1166" text-anchor="middle" font-weight="600">0</text><text x="276" y="1222" text-anchor="middle" font-weight="600">P&#95;PARO</text><text x="276" y="1270" text-anchor="middle" font-weight="600">0</text><text x="674" y="1118" text-anchor="middle" font-weight="600">P&#95;PARO</text></g></svg>
<figcaption>FBD de la lección 18: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

Cada orden es un `IF`: si el holding es distinto de 0, se hace la orden y se escribe 0. MARCHA pone `KM1 := TRUE` y PARO `KM1 := FALSE`. En Ladder, un bloque **NE** por EN/ENO deja la orden en un BOOL (`O_MARCHA`), ese contacto activa la bobina **S** (o **R**) de KM1 y un **MOVE** de 0 hace el acuse. En FBD, `KM1` es la memoria `(KM1 OR MARCHA) AND NOT PARO` y cada orden se borra con **SEL**.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y espera unos segundos: la PC **PC1** del **Esquema** dice «en línea».
2. Arrastra a la derecha el valor del **40002** (MARCHA): **KM1** cierra y el 40002 vuelve solo a 0.
3. Acciona el sensor **B1**: el **40001** cuenta. Arrastra el **40003** (PARO): la banda para y el 40003 vuelve a 0.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Contador a cero desde la PC: un tercer pulsador remoto en el 40004 pone el 40001 en 0 y el programa lo acusa devolviéndolo a 0.**

1. Ejecuta el ejemplo y espera «en línea» en la PC PC1. Arrastra el 40002 (MARCHA): la banda arranca y el 40002 vuelve solo a 0.
2. Acciona B1 un par de veces y mira el 40001. Arrastra el 40003 (PARO): la banda para y el 40003 vuelve a 0.
3. Declara P_CERO AT %MW3 (40004). Si es distinto de 0, pon CAJAS en 0 y devuelve P_CERO a 0.

> [!TIP] Qué te llevas
> Una orden por red se da como un pulso: la PC escribe un valor y el programa, al cumplirla, lo devuelve a 0. Ese acuse le dice a la PC que la orden se hizo y evita que se repita.
