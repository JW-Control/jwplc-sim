<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-2/07-contadores.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 07: Contadores

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 10 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/10-contadores/)

Una cinta lleva piezas a una caja; un sensor las ve pasar. Al llegar a la cantidad de la caja, la cinta para y avisa. Contar es otra de las tareas de todos los días de un PLC, y la norma trae sus contadores listos.

## Qué vas a aprender

- CTU, el contador ascendente: CU, R, PV, Q y CV.
- Que CTU cuenta flancos, no ciclos: una pieza es una sola cuenta.
- A usar la cuenta (CV) como un número entero (INT).

## CTU

| Pin | Qué es |
|---|---|
| **CU** | Cada flanco de subida suma uno |
| **R** | Con TRUE, la cuenta vuelve a cero |
| **PV** | La meta (valor preestablecido) |
| **Q** | TRUE cuando la cuenta llegó a PV |
| **CV** | La cuenta actual (INT) |

También hay **CTD** (cuenta hacia abajo desde PV) y **CTUD** (las dos cosas). Como TON, un contador es un bloque de función: cada uno se declara con su nombre, `PIEZAS : CTU;`.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    B1 AT %IX0.0  : BOOL; (* sensor de piezas *)
    S1 AT %IX0.1  : BOOL; (* RESET *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* caja llena *)
    PIEZAS        : CTU;
    LLENA         : BOOL;
    CUENTA        : INT; (* piezas en la caja *)
  END_VAR

  (* CTU cuenta cada flanco de subida de CU; Q se activa al llegar a PV. *)
  PIEZAS(CU := B1, R := FALSE, PV := 10);
  CUENTA := PIEZAS.CV;
  LLENA := PIEZAS.Q;

  KM1 := NOT LLENA;  (* la cinta para con la caja llena *)
  H1 := LLENA;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 641 418" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 641px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M627.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H488"/><path d="M516 50H627.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M323 90H353"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="66" height="140" rx="2"/><path d="M488 50H494M510 50H516"/><path d="M498 40Q492 50 498 60M506 40Q512 50 506 60"/></g><g transform="translate(6 216)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M77 58L83 42"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 322)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_1" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Cuenta piezas hasta 10 &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">B1</text><text x="290" y="27" text-anchor="middle" font-weight="700">CTU</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">PIEZAS</text><text x="261" y="53.5" text-anchor="start" font-size="9">CU</text><text x="261" y="93.5" text-anchor="start" font-size="9">R</text><text x="261" y="133.5" text-anchor="start" font-size="9">PV</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">CV</text><text x="502" y="32" text-anchor="middle" font-weight="600">LLENA</text><text x="223" y="94" text-anchor="end" font-weight="600">FALSE</text><text x="223" y="134" text-anchor="end" font-weight="600">10</text><text x="357" y="94" text-anchor="start" font-weight="600">CUENTA</text></g><g transform="translate(6 216)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; La cinta para con la caja llena &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">LLENA</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 322)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Aviso de caja llena &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">LLENA</text><text x="196" y="32" text-anchor="middle" font-weight="600">H1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 07, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 546 382" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 546px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M-56 82H20"/><path d="M-56 130H20"/><path d="M-56 178H20"/><path d="M80 82H230"/><path d="M80 130H230"/><path d="M-56 290H20"/><path d="M92 290H230"/><path d="M134 370H230"/><rect x="20" y="34" width="60" height="168" rx="2"/><rect x="-168" y="66" width="128" height="32" rx="16"/><rect x="-168" y="114" width="128" height="32" rx="16"/><rect x="-168" y="162" width="128" height="32" rx="16"/><rect x="230" y="66" width="128" height="32" rx="16"/><rect x="230" y="114" width="128" height="32" rx="16"/><rect x="20" y="242" width="72" height="72" rx="2"/><rect x="-168" y="274" width="128" height="32" rx="16"/><rect x="230" y="274" width="128" height="32" rx="16"/><rect x="22" y="354" width="128" height="32" rx="16"/><rect x="230" y="354" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="50" y="47" text-anchor="middle" font-weight="700">CTU</text><text x="50" y="29" text-anchor="middle" font-style="italic" opacity="0.8">PIEZAS</text><text x="24" y="85.5" text-anchor="start" font-size="9">CU</text><text x="24" y="133.5" text-anchor="start" font-size="9">R</text><text x="24" y="181.5" text-anchor="start" font-size="9">PV</text><text x="76" y="85.5" text-anchor="end" font-size="9">Q</text><text x="76" y="133.5" text-anchor="end" font-size="9">CV</text><text x="-104" y="86" text-anchor="middle" font-weight="600">B1</text><text x="-104" y="134" text-anchor="middle" font-weight="600">FALSE</text><text x="-104" y="182" text-anchor="middle" font-weight="600">10</text><text x="294" y="86" text-anchor="middle" font-weight="600">LLENA</text><text x="294" y="134" text-anchor="middle" font-weight="600">CUENTA</text><text x="56" y="255" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="293.5" text-anchor="start" font-size="9">IN</text><text x="88" y="293.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="294" text-anchor="middle" font-weight="600">LLENA</text><text x="294" y="294" text-anchor="middle" font-weight="600">KM1</text><text x="86" y="374" text-anchor="middle" font-weight="600">LLENA</text><text x="294" y="374" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 07: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

`PIEZAS(CU := B1, R := FALSE, PV := 10);` cuenta cada pieza que pasa por B1. `LLENA := PIEZAS.Q;` se pone en TRUE con 10; la cinta (`KM1 := NOT LLENA;`) para y H1 avisa. En el ejemplo R está fijo en FALSE: la caja nunca se vacía. En Ladder, el contacto B1 alimenta CU; PV y R son pines del bloque.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar**: la cinta (KM1) marcha.
2. Toca **B1** diez veces: con la décima, la cinta para y H1 se enciende.
3. En la práctica la caja es de 24 y RESET (S1) empieza otra.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Cajas de 24 piezas y RESET (S1) que empieza una caja nueva.**

1. Ejecuta el ejemplo: cada toque a B1 es una pieza; con 10 para la cinta.
2. Cambia la meta a 24 piezas (PV).
3. Conecta RESET: S1 a la entrada R del contador.
4. Llena una caja y empieza otra.

> [!TIP] Qué te llevas
> CTU suma uno en cada flanco de CU, avisa con Q al llegar a PV y vuelve a cero con R; CV es la cuenta.
