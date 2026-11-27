<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-1/04-set-y-reset.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 04: Set y reset

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 08 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/)

El enclavamiento guarda un estado con un contacto en paralelo. La norma trae otra forma, más directa: **set** (poner en TRUE) y **reset** (poner en FALSE). Lo que se pone en set queda así hasta que algo lo resetea, aunque la condición desaparezca.

## Qué vas a aprender

- Las bobinas S (set) y R (reset) de Ladder.
- Los bloques SR y RS de FBD: cuál gana si las dos entradas están activas.
- El equivalente en ST con dos IF.
- A memorizar una falla hasta que alguien la reconozca.

## Set y reset

| Ladder | ST | FBD |
|---|---|---|
| Bobina **S** | `IF … THEN KM1 := TRUE; END_IF;` | Entrada S de SR/RS |
| Bobina **R** | `IF … THEN KM1 := FALSE; END_IF;` | Entrada R de SR/RS |

Si set y reset están activos a la vez, gana el que se escribe **último** en el programa. En FBD lo dice el nombre del bloque: **SR** da prioridad al set (la S va primero en el nombre) y **RS** al reset. Para un motor se usa **RS**: con PARADA apretada no arranca aunque también se apriete MARCHA.

## Memorizar una falla

Cuando el térmico dispara, el motor para. Pero si el térmico se rearma solo y nadie se entera, el problema sigue ahí. Por eso la falla se **memoriza**: una variable FALLA se pone en set con el térmico abierto y solo se resetea cuando el operario la reconoce (aquí, apretando PARADA con el térmico ya normal).

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    MARCHA AT %IX0.0  : BOOL; (* S1, pulsador NA *)
    PARADA AT %IX0.1  : BOOL; (* S2, pulsador NC *)
    TERMICO AT %IX0.2 : BOOL; (* F1, térmico NC *)
    KM1 AT %QX0.0     : BOOL; (* contactor del motor *)
    H1 AT %QX0.1      : BOOL; (* piloto de falla *)
    H2 AT %QX0.2      : BOOL; (* piloto de marcha *)
    FALLA             : BOOL; (* falla del térmico memorizada *)
    RS_KM1            : RS;
    SR_FALLA          : SR;
  END_VAR

  (* Set y reset: MARCHA pone KM1 en TRUE y ahí queda;
     PARADA o el térmico lo vuelven a FALSE. El reset va después: gana. *)
  IF MARCHA THEN
    KM1 := TRUE;
  END_IF;
  IF NOT PARADA OR NOT TERMICO THEN
    KM1 := FALSE;
  END_IF;

  H2 := KM1;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 343 402" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 343px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 10)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 116)"><path stroke-width="3" d="M1.5 8V160M329.5 8V160"/><path d="M218 50H329.5"/><path d="M3 50H23"/><path d="M27 50H72"/><path d="M96 50H141"/><path d="M25 51V142H72"/><path d="M96 142H143V51"/><path d="M145 50H190"/><rect data-sig="I0_1" x="69" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M72 50H79M79 40V60M89 40V60M89 50H96"/><path d="M81 58L87 42"/><rect data-sig="I0_2" x="69" y="129" width="30" height="26" rx="4" stroke="none"/><path d="M72 142H79M79 132V152M89 132V152M89 142H96"/><path d="M81 150L87 134"/><rect data-sig="Q0_0" x="187" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M190 50H196M212 50H218"/><path d="M200 40Q194 50 200 60M208 40Q214 50 208 60"/></g><g transform="translate(6 306)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><rect data-sig="Q0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_2" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 10)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Set: MARCHA enciende KM1 &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">MARCHA</text><text x="196" y="54" text-anchor="middle" font-size="9">S</text><text x="196" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 116)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Reset: PARADA o el térmico lo apagan &#42;)</text><text x="84" y="32" text-anchor="middle" font-weight="600">PARADA</text><text x="84" y="124" text-anchor="middle" font-weight="600">TERMICO</text><text x="204" y="54" text-anchor="middle" font-size="9">R</text><text x="204" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 306)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Piloto de marcha &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">KM1</text><text x="196" y="32" text-anchor="middle" font-weight="600">H2</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 04, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 926 342" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 926px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M324 82H400"/><path d="M-56 162H20"/><path d="M92 162H210"/><path d="M-56 250H20"/><path d="M92 250H151V210H210"/><path d="M294 162H347V130H400"/><path d="M460 82H610"/><path d="M514 330H610"/><rect x="400" y="34" width="60" height="120" rx="2"/><rect x="212" y="66" width="128" height="32" rx="16"/><rect x="210" y="114" width="84" height="120" rx="2"/><rect x="20" y="114" width="72" height="72" rx="2"/><rect x="-168" y="146" width="128" height="32" rx="16"/><rect x="20" y="202" width="72" height="72" rx="2"/><rect x="-168" y="234" width="128" height="32" rx="16"/><rect x="610" y="66" width="128" height="32" rx="16"/><rect x="402" y="314" width="128" height="32" rx="16"/><rect x="610" y="314" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="430" y="47" text-anchor="middle" font-weight="700">RS</text><text x="430" y="29" text-anchor="middle" font-style="italic" opacity="0.8">RS&#95;KM1</text><text x="404" y="85.5" text-anchor="start" font-size="9">S</text><text x="404" y="133.5" text-anchor="start" font-size="9">R1</text><text x="456" y="85.5" text-anchor="end" font-size="9">Q1</text><text x="276" y="86" text-anchor="middle" font-weight="600">MARCHA</text><text x="252" y="127" text-anchor="middle" font-weight="700">OR</text><text x="214" y="165.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="213.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="165.5" text-anchor="end" font-size="9">OUT</text><text x="56" y="127" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="165.5" text-anchor="start" font-size="9">IN</text><text x="88" y="165.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="166" text-anchor="middle" font-weight="600">PARADA</text><text x="56" y="215" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="253.5" text-anchor="start" font-size="9">IN</text><text x="88" y="253.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="254" text-anchor="middle" font-weight="600">TERMICO</text><text x="674" y="86" text-anchor="middle" font-weight="600">KM1</text><text x="466" y="334" text-anchor="middle" font-weight="600">KM1</text><text x="674" y="334" text-anchor="middle" font-weight="600">H2</text></g></svg>
<figcaption>FBD de la lección 04: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

El ejemplo pone KM1 en TRUE con MARCHA y lo vuelve a FALSE con PARADA o el térmico. El reset está escrito después del set, así que gana. En Ladder son dos peldaños, uno con la bobina S y otro con la R; en FBD, un bloque RS con un OR en su entrada de reset.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar**: MARCHA (S1) pone KM1 y PARADA (S2) lo quita.
2. Dispara el térmico con **F1** y suéltalo: el motor queda parado.
3. En la práctica, la falla queda encendida en H1 hasta reconocerla con PARADA.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Falla del térmico memorizada en H1 (Q0.1): tras dispararse, MARCHA no arranca hasta reconocerla con PARADA.**

1. Ejecuta el ejemplo: MARCHA pone KM1 y PARADA lo quita.
2. Memoriza la falla: una variable FALLA que se pone con el térmico abierto.
3. PARADA la reconoce (la borra) solo con el térmico ya rearmado.
4. MARCHA solo arranca sin falla; H1 muestra la falla.

> [!TIP] Qué te llevas
> Set y reset (bobinas S y R, bloques SR y RS) guardan un estado hasta que otra condición lo borra; el que se escribe al final gana.
