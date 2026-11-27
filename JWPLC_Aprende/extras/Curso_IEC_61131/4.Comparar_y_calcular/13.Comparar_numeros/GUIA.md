<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-4/13-comparar-numeros-ge-lt-y-eq.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 13: Comparar números: GE, LT y EQ

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 10 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/10-contadores/)

En la lección 07 el contador decidía solo: su salida Q se activaba al llegar a PV. Pero una máquina suele tomar **varias decisiones con la misma cuenta**: avisar cuando falta poco, parar al completar, encender otra cosa a mitad de camino. Para eso se compara la cuenta con cada número que importa.

## Qué vas a aprender

- Los comparadores de la norma: EQ, NE, GT, GE, LT y LE; el resultado es un BOOL.
- A usar la cuenta (CV) de un contador en varias comparaciones.
- En Ladder, los comparadores se conectan por EN/ENO y dejan su resultado en un bit.

## Seis comparaciones

| Bloque | En ST | TRUE cuando |
|---|---|---|
| **EQ** | `A = B` | son iguales |
| **NE** | `A <> B` | son distintos |
| **GT** | `A > B` | A es mayor |
| **GE** | `A >= B` | A es mayor o igual |
| **LT** | `A < B` | A es menor |
| **LE** | `A <= B` | A es menor o igual |

## Un número, varias decisiones

```pascal
KM1 := CUENTA < 10;   (* la cinta sigue mientras falten piezas *)
H1 := CUENTA >= 10;   (* caja llena *)
```

Cada línea es una pregunta sobre el mismo número. Agregar un aviso a las 8 piezas es agregar una comparación, sin tocar el contador.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    B1 AT %IX0.0  : BOOL; (* sensor de piezas *)
    S1 AT %IX0.1  : BOOL; (* RESET *)
    KM1 AT %QX0.0 : BOOL; (* motor de la cinta *)
    H1 AT %QX0.1  : BOOL; (* aviso *)
    PIEZAS        : CTU;
    CUENTA        : INT; (* piezas en la caja *)
  END_VAR

  (* El contador solo cuenta: PV no importa, las decisiones las toman las comparaciones. *)
  PIEZAS(CU := B1, R := S1, PV := 100);
  CUENTA := PIEZAS.CV;

  (* Comparar: el resultado es un BOOL. *)
  KM1 := CUENTA < 10;   (* la cinta sigue mientras falten piezas *)
  H1 := CUENTA >= 10;   (* caja llena *)

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 598 618" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 598px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M584.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H584.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M323 90H353"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="66" height="140" rx="2"/></g><g transform="translate(6 232)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 438)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Cuenta piezas; S1 vuelve a cero &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">B1</text><text x="290" y="27" text-anchor="middle" font-weight="700">CTU</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">PIEZAS</text><text x="261" y="53.5" text-anchor="start" font-size="9">CU</text><text x="261" y="93.5" text-anchor="start" font-size="9">R</text><text x="261" y="133.5" text-anchor="start" font-size="9">PV</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">CV</text><text x="223" y="94" text-anchor="end" font-weight="600">S1</text><text x="223" y="134" text-anchor="end" font-weight="600">100</text><text x="357" y="94" text-anchor="start" font-weight="600">CUENTA</text></g><g transform="translate(6 232)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; La cinta sigue mientras CUENTA &lt; 10 &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">LT</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">CUENTA</text><text x="109" y="134" text-anchor="end" font-weight="600">10</text><text x="267" y="94" text-anchor="start" font-weight="600">KM1</text></g><g transform="translate(6 438)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Caja llena: CUENTA &gt;= 10 &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">GE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">CUENTA</text><text x="109" y="134" text-anchor="end" font-weight="600">10</text><text x="267" y="94" text-anchor="start" font-weight="600">H1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 13, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 546 518" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 546px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M-56 82H20"/><path d="M-56 130H20"/><path d="M-56 178H20"/><path d="M80 130H230"/><path d="M-56 290H20"/><path d="M-56 338H20"/><path d="M104 290H230"/><path d="M-56 450H20"/><path d="M-56 498H20"/><path d="M104 450H230"/><rect x="20" y="34" width="60" height="168" rx="2"/><rect x="-168" y="66" width="128" height="32" rx="16"/><rect x="-168" y="114" width="128" height="32" rx="16"/><rect x="-168" y="162" width="128" height="32" rx="16"/><rect x="230" y="114" width="128" height="32" rx="16"/><rect x="20" y="242" width="84" height="120" rx="2"/><rect x="-168" y="274" width="128" height="32" rx="16"/><rect x="-168" y="322" width="128" height="32" rx="16"/><rect x="230" y="274" width="128" height="32" rx="16"/><rect x="20" y="402" width="84" height="120" rx="2"/><rect x="-168" y="434" width="128" height="32" rx="16"/><rect x="-168" y="482" width="128" height="32" rx="16"/><rect x="230" y="434" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="50" y="47" text-anchor="middle" font-weight="700">CTU</text><text x="50" y="29" text-anchor="middle" font-style="italic" opacity="0.8">PIEZAS</text><text x="24" y="85.5" text-anchor="start" font-size="9">CU</text><text x="24" y="133.5" text-anchor="start" font-size="9">R</text><text x="24" y="181.5" text-anchor="start" font-size="9">PV</text><text x="76" y="85.5" text-anchor="end" font-size="9">Q</text><text x="76" y="133.5" text-anchor="end" font-size="9">CV</text><text x="-104" y="86" text-anchor="middle" font-weight="600">B1</text><text x="-104" y="134" text-anchor="middle" font-weight="600">S1</text><text x="-104" y="182" text-anchor="middle" font-weight="600">100</text><text x="294" y="134" text-anchor="middle" font-weight="600">CUENTA</text><text x="62" y="255" text-anchor="middle" font-weight="700">LT</text><text x="24" y="293.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="341.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="293.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="294" text-anchor="middle" font-weight="600">CUENTA</text><text x="-104" y="342" text-anchor="middle" font-weight="600">10</text><text x="294" y="294" text-anchor="middle" font-weight="600">KM1</text><text x="62" y="415" text-anchor="middle" font-weight="700">GE</text><text x="24" y="453.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="501.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="453.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="454" text-anchor="middle" font-weight="600">CUENTA</text><text x="-104" y="502" text-anchor="middle" font-weight="600">10</text><text x="294" y="454" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 13: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

El contador queda con un PV alto (100): solo se usa su cuenta **CV**, que se copia a `CUENTA`. Las decisiones salen de las comparaciones. En Ladder cada comparación es un bloque **LT** o **GE** con *Execution control* (EN/ENO) en el riel, que escribe su resultado en un bit (KM1, H1). En FBD, el bloque recibe la cuenta y el número y su salida va directo a la variable.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar**: la cinta (KM1) marcha.
2. Toca **B1** diez veces: con la décima, la cinta para y H1 se enciende.
3. **S1** vuelve la cuenta a cero.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Cajas de 12 piezas y el aviso H1 desde la pieza 8, para que el operador prepare la caja siguiente.**

1. Ejecuta el ejemplo: cada toque a B1 es una pieza; con 10 la cinta para y H1 avisa.
2. Cambia la meta a 12 piezas en la comparación de KM1.
3. Haz que H1 encienda desde la pieza 8 (GE con 8).
4. Llena una caja y vuelve a cero con S1.

> [!TIP] Qué te llevas
> Un contador da un número; las comparaciones (LT, GE, EQ…) lo convierten en decisiones, y con varias comparaciones sobre la misma cuenta se arman avisos por etapas.
