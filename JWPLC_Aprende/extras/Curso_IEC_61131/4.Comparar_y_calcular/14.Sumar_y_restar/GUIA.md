<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-4/14-sumar-y-restar-un-estacionamiento.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 14: Sumar y restar: un estacionamiento

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 03 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/)

Un estacionamiento tiene una barrera de entrada y otra de salida. Cada auto que entra suma uno; cada uno que sale, resta uno. Con la cuenta se calcula cuántos lugares quedan y se enciende el cartel de **lleno**. Es la cuenta más simple que sube y baja, y la base de cualquier inventario.

## Qué vas a aprender

- ADD y SUB: sumar y restar enteros (INT).
- A sumar en el flanco del evento, no mientras dure la señal.
- A calcular un valor a partir de otro (LIBRES := 5 - AUTOS) y compararlo.

## Sumar en el flanco

Si se escribe `AUTOS := AUTOS + 1;` con la barrera abierta, el programa suma uno **en cada vuelta**: cincuenta autos por segundo. Hay que sumar solo en el instante en que la barrera se abre, su **flanco de subida** (lección 06):

```pascal
F_ENTRA(CLK := S1);
IF F_ENTRA.Q THEN
  AUTOS := AUTOS + 1;
END_IF;
```

En Ladder, el contacto de flanco **^S1** (P) deja pasar corriente una sola vuelta y alimenta la entrada EN de un bloque **ADD**. En FBD, un **R_TRIG** da el flanco y un **SEL** elige entre la cuenta y la cuenta + 1.

## Calcular y comparar

`LIBRES := 5 - AUTOS;` es otro número que se calcula en cada vuelta. Con él, `H1 := LIBRES > 0;` y `H2 := LIBRES <= 0;`.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* barrera de entrada: entra un auto *)
    S2 AT %IX0.1 : BOOL; (* barrera de salida: sale un auto *)
    H1 AT %QX0.0 : BOOL; (* verde: hay lugar *)
    H2 AT %QX0.1 : BOOL; (* amarillo: lleno *)
    F_ENTRA      : R_TRIG;
    F_SALE       : R_TRIG;
    AUTOS        : INT; (* autos adentro *)
    LIBRES       : INT; (* lugares libres *)
  END_VAR

  (* Un auto por flanco: si no, sumaría en cada vuelta mientras la barrera esté abierta. *)
  F_ENTRA(CLK := S1);
  F_SALE(CLK := S2);

  IF F_ENTRA.Q THEN
    AUTOS := AUTOS + 1;
  END_IF;
  IF F_SALE.Q THEN
    AUTOS := AUTOS - 1;
  END_IF;

  (* Capacidad: 5 lugares. *)
  LIBRES := 5 - AUTOS;
  H1 := LIBRES > 0;
  H2 := LIBRES <= 0;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 622 1030" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 622px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M608.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M347 50H608.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M347 90H377"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 232)"><path stroke-width="3" d="M1.5 -8V160M608.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M347 50H608.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M347 90H377"/><rect data-sig="I0_1" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 438)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 644)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 850)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Entra un auto: AUTOS + 1 en el flanco de S1 &#42;)</text><text x="80" y="54" text-anchor="middle" font-size="9">P</text><text x="80" y="32" text-anchor="middle" font-weight="600">S1</text><text x="302" y="27" text-anchor="middle" font-weight="700">ADD</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="261" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="343" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="343" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">AUTOS</text><text x="223" y="134" text-anchor="end" font-weight="600">1</text><text x="381" y="94" text-anchor="start" font-weight="600">AUTOS</text></g><g transform="translate(6 232)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Sale un auto: AUTOS - 1 en el flanco de S2 &#42;)</text><text x="80" y="54" text-anchor="middle" font-size="9">P</text><text x="80" y="32" text-anchor="middle" font-weight="600">S2</text><text x="302" y="27" text-anchor="middle" font-weight="700">SUB</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="261" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="343" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="343" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">AUTOS</text><text x="223" y="134" text-anchor="end" font-weight="600">1</text><text x="381" y="94" text-anchor="start" font-weight="600">AUTOS</text></g><g transform="translate(6 438)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Lugares libres: 5 - AUTOS &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">SUB</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">5</text><text x="109" y="134" text-anchor="end" font-weight="600">AUTOS</text><text x="267" y="94" text-anchor="start" font-weight="600">LIBRES</text></g><g transform="translate(6 644)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Verde: hay lugar &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">GT</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">LIBRES</text><text x="109" y="134" text-anchor="end" font-weight="600">0</text><text x="267" y="94" text-anchor="start" font-weight="600">H1</text></g><g transform="translate(6 850)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Amarillo: lleno &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">LE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">LIBRES</text><text x="109" y="134" text-anchor="end" font-weight="600">0</text><text x="267" y="94" text-anchor="start" font-weight="600">H2</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 14, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 736 1284" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 736px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M134 82H210"/><path d="M282 82H420"/><path d="M134 208H210"/><path d="M282 208H420"/><path d="M134 320H210"/><path d="M134 368H210"/><path d="M-56 448H20"/><path d="M-56 496H20"/><path d="M104 448H157V416H210"/><path d="M294 320H420"/><path d="M134 608H210"/><path d="M134 656H210"/><path d="M-56 736H20"/><path d="M-56 784H20"/><path d="M104 736H157V704H210"/><path d="M294 608H420"/><path d="M134 896H210"/><path d="M134 944H210"/><path d="M294 896H420"/><path d="M134 1056H210"/><path d="M134 1104H210"/><path d="M294 1056H420"/><path d="M134 1216H210"/><path d="M134 1264H210"/><path d="M294 1216H420"/><rect x="210" y="34" width="72" height="72" rx="2"/><rect x="22" y="66" width="128" height="32" rx="16"/><rect x="420" y="66" width="128" height="32" rx="16"/><rect x="210" y="160" width="72" height="72" rx="2"/><rect x="22" y="192" width="128" height="32" rx="16"/><rect x="420" y="192" width="128" height="32" rx="16"/><rect x="210" y="272" width="84" height="168" rx="2"/><rect x="22" y="304" width="128" height="32" rx="16"/><rect x="22" y="352" width="128" height="32" rx="16"/><rect x="20" y="400" width="84" height="120" rx="2"/><rect x="-168" y="432" width="128" height="32" rx="16"/><rect x="-168" y="480" width="128" height="32" rx="16"/><rect x="420" y="304" width="128" height="32" rx="16"/><rect x="210" y="560" width="84" height="168" rx="2"/><rect x="22" y="592" width="128" height="32" rx="16"/><rect x="22" y="640" width="128" height="32" rx="16"/><rect x="20" y="688" width="84" height="120" rx="2"/><rect x="-168" y="720" width="128" height="32" rx="16"/><rect x="-168" y="768" width="128" height="32" rx="16"/><rect x="420" y="592" width="128" height="32" rx="16"/><rect x="210" y="848" width="84" height="120" rx="2"/><rect x="22" y="880" width="128" height="32" rx="16"/><rect x="22" y="928" width="128" height="32" rx="16"/><rect x="420" y="880" width="128" height="32" rx="16"/><rect x="210" y="1008" width="84" height="120" rx="2"/><rect x="22" y="1040" width="128" height="32" rx="16"/><rect x="22" y="1088" width="128" height="32" rx="16"/><rect x="420" y="1040" width="128" height="32" rx="16"/><rect x="210" y="1168" width="84" height="120" rx="2"/><rect x="22" y="1200" width="128" height="32" rx="16"/><rect x="22" y="1248" width="128" height="32" rx="16"/><rect x="420" y="1200" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="246" y="47" text-anchor="middle" font-weight="700">R&#95;TRIG</text><text x="246" y="29" text-anchor="middle" font-style="italic" opacity="0.8">F&#95;ENTRA</text><text x="214" y="85.5" text-anchor="start" font-size="9">CLK</text><text x="278" y="85.5" text-anchor="end" font-size="9">Q</text><text x="86" y="86" text-anchor="middle" font-weight="600">S1</text><text x="484" y="86" text-anchor="middle" font-weight="600">ENTRA</text><text x="246" y="173" text-anchor="middle" font-weight="700">R&#95;TRIG</text><text x="246" y="155" text-anchor="middle" font-style="italic" opacity="0.8">F&#95;SALE</text><text x="214" y="211.5" text-anchor="start" font-size="9">CLK</text><text x="278" y="211.5" text-anchor="end" font-size="9">Q</text><text x="86" y="212" text-anchor="middle" font-weight="600">S2</text><text x="484" y="212" text-anchor="middle" font-weight="600">SALE</text><text x="252" y="285" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="323.5" text-anchor="start" font-size="9">G</text><text x="214" y="371.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="419.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="323.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="324" text-anchor="middle" font-weight="600">ENTRA</text><text x="86" y="372" text-anchor="middle" font-weight="600">AUTOS</text><text x="62" y="413" text-anchor="middle" font-weight="700">ADD</text><text x="24" y="451.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="499.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="451.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="452" text-anchor="middle" font-weight="600">AUTOS</text><text x="-104" y="500" text-anchor="middle" font-weight="600">1</text><text x="484" y="324" text-anchor="middle" font-weight="600">AUTOS</text><text x="252" y="573" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="611.5" text-anchor="start" font-size="9">G</text><text x="214" y="659.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="707.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="611.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="612" text-anchor="middle" font-weight="600">SALE</text><text x="86" y="660" text-anchor="middle" font-weight="600">AUTOS</text><text x="62" y="701" text-anchor="middle" font-weight="700">SUB</text><text x="24" y="739.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="787.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="739.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="740" text-anchor="middle" font-weight="600">AUTOS</text><text x="-104" y="788" text-anchor="middle" font-weight="600">1</text><text x="484" y="612" text-anchor="middle" font-weight="600">AUTOS</text><text x="252" y="861" text-anchor="middle" font-weight="700">SUB</text><text x="214" y="899.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="947.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="899.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="900" text-anchor="middle" font-weight="600">5</text><text x="86" y="948" text-anchor="middle" font-weight="600">AUTOS</text><text x="484" y="900" text-anchor="middle" font-weight="600">LIBRES</text><text x="252" y="1021" text-anchor="middle" font-weight="700">GT</text><text x="214" y="1059.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="1107.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="1059.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="1060" text-anchor="middle" font-weight="600">LIBRES</text><text x="86" y="1108" text-anchor="middle" font-weight="600">0</text><text x="484" y="1060" text-anchor="middle" font-weight="600">H1</text><text x="252" y="1181" text-anchor="middle" font-weight="700">LE</text><text x="214" y="1219.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="1267.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="1219.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="1220" text-anchor="middle" font-weight="600">LIBRES</text><text x="86" y="1268" text-anchor="middle" font-weight="600">0</text><text x="484" y="1220" text-anchor="middle" font-weight="600">H2</text></g></svg>
<figcaption>FBD de la lección 14: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

El ejemplo no tiene límites: un auto que entra con el estacionamiento lleno suma igual, y una salida de más deja la cuenta en negativo. En la vida real pasa (un sensor que rebota, un operador que prueba la barrera) y la cuenta deja de representar lo que hay. La práctica agrega una comparación antes de sumar y otra antes de restar.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar**: H1 (verde) encendido.
2. Toca **S1** cinco veces: con el quinto auto, H2 (lleno).
3. Toca **S2**: sale un auto y vuelve el verde.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Un estacionamiento de 3 lugares cuya cuenta nunca pasa de 3 ni baja de 0, aunque las barreras se accionen de más.**

1. Ejecuta el ejemplo: S1 es un auto que entra y S2 uno que sale; con 5 adentro, H2 avisa lleno.
2. Cambia la capacidad a 3.
3. Suma solo si AUTOS < 3 y resta solo si AUTOS > 0.
4. Prueba de más: entra un cuarto auto y salen más autos de los que hay; la cuenta no se sale de 0…3.

> [!TIP] Qué te llevas
> ADD y SUB cambian una cuenta en el flanco de un evento; una comparación antes de sumar o restar mantiene el número dentro de sus límites.
