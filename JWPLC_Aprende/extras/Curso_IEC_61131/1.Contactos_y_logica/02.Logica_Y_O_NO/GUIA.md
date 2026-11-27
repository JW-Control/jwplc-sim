<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-1/02-logica-y-o-no.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 02: Lógica Y, O, NO

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 04 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/04-variables-y-decisiones/)

Casi toda la lógica de un tablero se arma con tres palabras: **Y**, **O** y **NO**. Una prensa que baja solo con las dos manos del operario en los mandos (Y), una alarma que suena con cualquiera de dos sensores (O), una luz que avisa que algo NO está.

## Qué vas a aprender

- Y (AND): contactos en serie.
- O (OR): contactos en paralelo.
- NO (NOT): contacto cerrado.
- Que un bloque AND u OR de FBD admite más de dos entradas.

## Serie es Y, paralelo es O

En Ladder la corriente va del riel izquierdo a la bobina. Con dos contactos **en serie**, tiene que pasar por los dos: la bobina se enciende con SA1 **y** SA2. Con dos contactos **en paralelo**, le alcanza uno de los dos caminos: SA1 **o** SA2.

| Idea | Ladder | ST | FBD |
|---|---|---|---|
| Y | Contactos en serie | `SA1 AND SA2` | Bloque AND |
| O | Contactos en paralelo | `SA1 OR SA2` | Bloque OR |
| NO | Contacto cerrado | `NOT SA1` | Bloque NOT |

## La prensa a dos manos

Una prensa no baja si el operario tiene una mano libre: podría estar debajo. Por eso pide dos mandos, uno para cada mano, y baja solo con los dos apretados. Es la Y más famosa de la industria.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    SA1 AT %IX0.0 : BOOL; (* mano izquierda *)
    SA2 AT %IX0.1 : BOOL; (* mano derecha *)
    SA3 AT %IX0.2 : BOOL; (* tercera mano *)
    H1 AT %QX0.0  : BOOL; (* prensa *)
    H2 AT %QX0.1  : BOOL;
    H3 AT %QX0.2  : BOOL;
    H5 AT %QX0.4  : BOOL;
  END_VAR

  (* Y: la prensa baja solo con las dos manos. *)
  H1 := SA1 AND SA2;

  (* O: H2 con cualquiera de las dos. *)
  H2 := SA1 OR SA2;

  (* NO: H3 encendido mientras SA1 está suelto. *)
  H3 := NOT SA1;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 449 402" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 449px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 10)"><path stroke-width="3" d="M1.5 8V76M435.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M206 50H296"/><path d="M324 50H435.5"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="I0_1" x="179" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M182 50H189M189 40V60M199 40V60M199 50H206"/><rect data-sig="Q0_0" x="293" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M296 50H302M318 50H324"/><path d="M306 40Q300 50 306 60M314 40Q320 50 314 60"/></g><g transform="translate(6 116)"><path stroke-width="3" d="M1.5 8V160M329.5 8V160"/><path d="M218 50H329.5"/><path d="M3 50H23"/><path d="M27 50H72"/><path d="M96 50H141"/><path d="M25 51V142H72"/><path d="M96 142H143V51"/><path d="M145 50H190"/><rect data-sig="I0_0" x="69" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M72 50H79M79 40V60M89 40V60M89 50H96"/><rect data-sig="I0_1" x="69" y="129" width="30" height="26" rx="4" stroke="none"/><path d="M72 142H79M79 132V152M89 132V152M89 142H96"/><rect data-sig="Q0_1" x="187" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M190 50H196M212 50H218"/><path d="M200 40Q194 50 200 60M208 40Q214 50 208 60"/></g><g transform="translate(6 306)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M77 58L83 42"/><rect data-sig="Q0_2" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 10)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Y: contactos en serie &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">SA1</text><text x="194" y="32" text-anchor="middle" font-weight="600">SA2</text><text x="310" y="32" text-anchor="middle" font-weight="600">H1</text></g><g transform="translate(6 116)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; O: contactos en paralelo &#42;)</text><text x="84" y="32" text-anchor="middle" font-weight="600">SA1</text><text x="84" y="124" text-anchor="middle" font-weight="600">SA2</text><text x="204" y="32" text-anchor="middle" font-weight="600">H2</text></g><g transform="translate(6 306)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; NO: contacto cerrado &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">SA1</text><text x="196" y="32" text-anchor="middle" font-weight="600">H3</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 02, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 0 508 382" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 508px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M162 36H231V68H300"/><path d="M162 76H231V116H300"/><path d="M384 68H397V36H410"/><path d="M162 176H231V208H300"/><path d="M162 216H231V256H300"/><path d="M384 208H397V176H410"/><path d="M162 316H231V348H300"/><path d="M372 348H391V316H410"/><rect x="300" y="20" width="84" height="120" rx="2"/><rect x="50" y="20" width="128" height="32" rx="16"/><rect x="50" y="60" width="128" height="32" rx="16"/><rect x="410" y="20" width="128" height="32" rx="16"/><rect x="300" y="160" width="84" height="120" rx="2"/><rect x="50" y="160" width="128" height="32" rx="16"/><rect x="50" y="200" width="128" height="32" rx="16"/><rect x="410" y="160" width="128" height="32" rx="16"/><rect x="300" y="300" width="72" height="72" rx="2"/><rect x="50" y="300" width="128" height="32" rx="16"/><rect x="410" y="300" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="342" y="33" text-anchor="middle" font-weight="700">AND</text><text x="304" y="71.5" text-anchor="start" font-size="9">IN1</text><text x="304" y="119.5" text-anchor="start" font-size="9">IN2</text><text x="380" y="71.5" text-anchor="end" font-size="9">OUT</text><text x="114" y="40" text-anchor="middle" font-weight="600">SA1</text><text x="114" y="80" text-anchor="middle" font-weight="600">SA2</text><text x="474" y="40" text-anchor="middle" font-weight="600">H1</text><text x="342" y="173" text-anchor="middle" font-weight="700">OR</text><text x="304" y="211.5" text-anchor="start" font-size="9">IN1</text><text x="304" y="259.5" text-anchor="start" font-size="9">IN2</text><text x="380" y="211.5" text-anchor="end" font-size="9">OUT</text><text x="114" y="180" text-anchor="middle" font-weight="600">SA1</text><text x="114" y="220" text-anchor="middle" font-weight="600">SA2</text><text x="474" y="180" text-anchor="middle" font-weight="600">H2</text><text x="336" y="313" text-anchor="middle" font-weight="700">NOT</text><text x="304" y="351.5" text-anchor="start" font-size="9">IN</text><text x="368" y="351.5" text-anchor="end" font-size="9">OUT</text><text x="114" y="320" text-anchor="middle" font-weight="600">SA1</text><text x="474" y="320" text-anchor="middle" font-weight="600">H3</text></g></svg>
<figcaption>FBD de la lección 02: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

Cada salida tiene su propia línea (un peldaño en Ladder, una red en FBD). `H1 := SA1 AND SA2;` baja la prensa con las dos manos; `H2 := SA1 OR SA2;` se enciende con cualquiera; `H3 := NOT SA1;` está encendido mientras SA1 está suelto. Las tres se calculan en cada ciclo, una después de la otra.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y mueve los selectores **SA1** y **SA2** en **Mandos** (en el banco son las manos).
2. Con uno solo, H1 queda apagado; con los dos, se enciende. H2 se enciende con cualquiera.
3. H3 está encendido mientras SA1 está en 0.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Prensa a tres manos en H1 (Q0.0) y H5 (Q0.4) encendido con SA1 activa pero SA2 inactiva.**

1. Ejecuta el ejemplo y prueba los selectores (en el banco son las «manos»).
2. Agrega la tercera mano SA3: H1 solo con las tres.
3. H5: encendido con SA1 activa y SA2 inactiva.
4. Prueba todas las combinaciones.

> [!TIP] Qué te llevas
> Y son contactos en serie (AND), O son contactos en paralelo (OR) y NO es un contacto cerrado (NOT).
