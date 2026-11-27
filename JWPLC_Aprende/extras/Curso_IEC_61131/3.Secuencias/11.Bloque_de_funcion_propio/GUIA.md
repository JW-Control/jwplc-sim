<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-3/11-bloque-de-funcion-propio-un-motor.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 11: Bloque de función propio: un motor

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 12 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/12-clases-un-motor/)

Ya usaste bloques de la norma: TON, CTU, R_TRIG. Cada uno guarda sus datos y se usa con una **instancia** por equipo (`T1`, `T2`…). Con un **FUNCTION_BLOCK** propio haces lo mismo con tu lógica: la marcha y parada de un motor se escribe una vez y se usa en cada bomba. Es la misma idea que las clases de C++ (lección 12).

## Qué vas a aprender

- A escribir un FUNCTION_BLOCK con entradas (VAR_INPUT), salidas (VAR_OUTPUT) y datos internos (VAR).
- A declarar una instancia por equipo y a llamarla desde ST, Ladder y FBD.
- Que cada instancia guarda sus propios datos: detener una bomba no toca a la otra.

## El bloque MOTOR

El bloque va en su propio archivo, `pous/function-blocks/MOTOR.st`, y se escribe en ST:

```pascal
FUNCTION_BLOCK MOTOR
  VAR_INPUT
    MARCHA : BOOL;      (* pulsador NA *)
    PARADA : BOOL;      (* pulsador NC: TRUE sin pulsar *)
  END_VAR
  VAR_OUTPUT
    Q : BOOL;           (* en marcha *)
    ARRANQUES : INT;    (* veces que arrancó *)
  END_VAR
  VAR
    FLANCO : R_TRIG;
  END_VAR

  Q := (Q OR MARCHA) AND PARADA;
  FLANCO(CLK := Q);
  IF FLANCO.Q THEN
    ARRANQUES := ARRANQUES + 1;
  END_IF;
END_FUNCTION_BLOCK
```

- **VAR_INPUT** son las patas de la izquierda del bloque; **VAR_OUTPUT**, las de la derecha.
- **VAR** son sus datos internos: quedan guardados entre una vuelta y la siguiente, y nadie de afuera los toca.

## Una instancia por equipo

En el programa se declara una variable del tipo del bloque por cada bomba, igual que un TON:

```pascal
VAR
  BOMBA1 : MOTOR;
  BOMBA2 : MOTOR;
END_VAR
```

`BOMBA1` y `BOMBA2` tienen cada una su `Q` y su `ARRANQUES`. En Ladder y FBD el bloque MOTOR aparece en la lista de bloques del proyecto, con el nombre de la instancia encima.

## En el OpenPLC Editor

Se crea con **Agregar POU → Function Block**, lenguaje ST. Un bloque escrito en ST se usa igual desde un programa en Ladder o FBD.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
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

  (* Una instancia del bloque MOTOR por bomba: cada una guarda sus datos. *)
  BOMBA1(MARCHA := S1, PARADA := S2);
  KM1 := BOMBA1.Q;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 773 166" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 773px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V120M759.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M455 50H620"/><path d="M648 50H759.5"/><path d="M227 90H257"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="198" height="100" rx="2"/><rect data-sig="Q0_0" x="617" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M620 50H626M642 50H648"/><path d="M630 40Q624 50 630 60M638 40Q644 50 638 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Bomba 1: el bloque MOTOR hace la marcha y parada &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">S1</text><text x="356" y="27" text-anchor="middle" font-weight="700">MOTOR</text><text x="356" y="9" text-anchor="middle" font-style="italic" opacity="0.8">BOMBA1</text><text x="261" y="53.5" text-anchor="start" font-size="9">MARCHA</text><text x="261" y="93.5" text-anchor="start" font-size="9">PARADA</text><text x="451" y="53.5" text-anchor="end" font-size="9">Q</text><text x="451" y="93.5" text-anchor="end" font-size="9">ARRANQUES</text><text x="634" y="32" text-anchor="middle" font-weight="600">KM1</text><text x="223" y="94" text-anchor="end" font-weight="600">S2</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 11, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 546 150" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 546px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M-56 82H20"/><path d="M-56 130H20"/><path d="M212 82H230"/><rect x="20" y="34" width="192" height="120" rx="2"/><rect x="-168" y="66" width="128" height="32" rx="16"/><rect x="-168" y="114" width="128" height="32" rx="16"/><rect x="230" y="66" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="116" y="47" text-anchor="middle" font-weight="700">MOTOR</text><text x="116" y="29" text-anchor="middle" font-style="italic" opacity="0.8">BOMBA1</text><text x="24" y="85.5" text-anchor="start" font-size="9">MARCHA</text><text x="24" y="133.5" text-anchor="start" font-size="9">PARADA</text><text x="208" y="85.5" text-anchor="end" font-size="9">Q</text><text x="208" y="133.5" text-anchor="end" font-size="9">ARRANQUES</text><text x="-104" y="86" text-anchor="middle" font-weight="600">S1</text><text x="-104" y="134" text-anchor="middle" font-weight="600">S2</text><text x="294" y="86" text-anchor="middle" font-weight="600">KM1</text></g></svg>
<figcaption>FBD de la lección 11: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

`BOMBA1(MARCHA := S1, PARADA := S2);` llama al bloque con los pulsadores de la bomba 1, y `BOMBA1.Q` lee su salida. En Ladder, la primera entrada (MARCHA) y la primera salida (Q) del bloque van en el riel: el contacto S1 alimenta MARCHA y Q enciende la bobina KM1; PARADA se conecta aparte, con S2.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: arranca la bomba 1. **S2** la detiene.
2. Abre `pous/function-blocks/MOTOR.st` en el panel del código para ver el bloque.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**La bomba 2 (Q0.1) con otra instancia del bloque MOTOR (S3 marcha, S4 parada) y la lámpara H1 (Q0.2) encendida con cualquier bomba en marcha.**

1. Ejecuta el ejemplo: S1 arranca la bomba 1 y S2 la detiene; mira el bloque MOTOR en pous/function-blocks.
2. Declara BOMBA2 : MOTOR y llámala con S3 y S4; su salida Q a KM2.
3. Enciende H1 con BOMBA1.Q OR BOMBA2.Q.
4. Arranca las dos y detenlas por separado: cada instancia es independiente.

> [!TIP] Qué te llevas
> Un FUNCTION_BLOCK propio se escribe una vez y se usa en cada equipo con su propia instancia, que guarda sus datos aparte, igual que una clase en C++.
