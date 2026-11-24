<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-2/06-flancos-un-pulsador-que-enciende-y-apaga.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 06: Flancos: un pulsador que enciende y apaga

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 07 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/07-flancos-un-pulsador/)

Un pulsador que enciende la luz y, a la siguiente pulsación, la apaga: el **telerruptor**. Si el programa mirara solo «está apretado», la luz cambiaría en cada ciclo mientras se mantiene el dedo, decenas de veces por segundo. Lo que interesa es el **instante** en que cambia: el flanco.

## Qué vas a aprender

- Flanco de subida (R_TRIG, contacto P) y de bajada (F_TRIG, contacto N).
- Que un flanco dura un solo ciclo.
- A cambiar una salida con XOR: `H1 := H1 XOR PULSO;`.

## Un ciclo de largo

**R_TRIG** mira su entrada CLK en cada ciclo y da Q = TRUE **solo en el ciclo** en que CLK pasó de FALSE a TRUE. **F_TRIG** hace lo mismo al pasar de TRUE a FALSE. En Ladder son los contactos con **P** (positivo) y **N** (negativo).

## Cambiar con XOR

XOR (O exclusivo) da TRUE cuando sus dos entradas son distintas. `H1 XOR PULSO` deja H1 como estaba si no hay pulso y lo invierte en el ciclo del pulso: justo el telerruptor.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* luz que cambia al apretar *)
    H2 AT %QX0.1 : BOOL; (* luz que cambia al soltar *)
    APRIETA      : R_TRIG;
    SUELTA       : F_TRIG;
    PULSO        : BOOL; (* un ciclo al apretar *)
    PULSO2       : BOOL; (* un ciclo al soltar *)
  END_VAR

  (* R_TRIG da TRUE un solo ciclo cuando S1 pasa de suelto a apretado. *)
  APRIETA(CLK := S1);
  IF APRIETA.Q THEN
    H1 := NOT H1;  (* telerruptor: cada pulsación cambia la luz *)
  END_IF;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 665 272" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 665px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 10)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g><g transform="translate(6 132)"><path stroke-width="3" d="M1.5 -8V120M651.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M347 50H512"/><path d="M540 50H651.5"/><path d="M227 90H257"/><rect data-sig="Q0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="90" height="100" rx="2"/><rect data-sig="Q0_0" x="509" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M512 50H518M534 50H540"/><path d="M522 40Q516 50 522 60M530 40Q536 50 530 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 10)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Flanco de subida de S1: un ciclo &#42;)</text><text x="80" y="54" text-anchor="middle" font-size="9">P</text><text x="80" y="32" text-anchor="middle" font-weight="600">S1</text><text x="196" y="32" text-anchor="middle" font-weight="600">PULSO</text></g><g transform="translate(6 132)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Con el pulso, H1 cambia: O exclusivo &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">H1</text><text x="302" y="27" text-anchor="middle" font-weight="700">XOR</text><text x="261" y="53.5" text-anchor="start" font-size="9">IN1</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN2</text><text x="343" y="53.5" text-anchor="end" font-size="9">OUT</text><text x="526" y="32" text-anchor="middle" font-weight="600">H1</text><text x="223" y="94" text-anchor="end" font-weight="600">PULSO</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 06, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 0 658 282" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 658px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 36H81V68H150"/><path d="M222 68H247V36H272"/><path d="M162 168H231V200H300"/><path d="M162 208H231V248H300"/><path d="M384 200H397V168H410"/><rect x="150" y="20" width="72" height="72" rx="2"/><rect x="-100" y="20" width="128" height="32" rx="16"/><rect x="272" y="20" width="128" height="32" rx="16"/><rect x="300" y="152" width="84" height="120" rx="2"/><rect x="50" y="152" width="128" height="32" rx="16"/><rect x="50" y="192" width="128" height="32" rx="16"/><rect x="410" y="152" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="186" y="33" text-anchor="middle" font-weight="700">R&#95;TRIG</text><text x="186" y="15" text-anchor="middle" font-style="italic" opacity="0.8">APRIETA</text><text x="154" y="71.5" text-anchor="start" font-size="9">CLK</text><text x="218" y="71.5" text-anchor="end" font-size="9">Q</text><text x="-36" y="40" text-anchor="middle" font-weight="600">S1</text><text x="336" y="40" text-anchor="middle" font-weight="600">PULSO</text><text x="342" y="165" text-anchor="middle" font-weight="700">XOR</text><text x="304" y="203.5" text-anchor="start" font-size="9">IN1</text><text x="304" y="251.5" text-anchor="start" font-size="9">IN2</text><text x="380" y="203.5" text-anchor="end" font-size="9">OUT</text><text x="114" y="172" text-anchor="middle" font-weight="600">H1</text><text x="114" y="212" text-anchor="middle" font-weight="600">PULSO</text><text x="474" y="172" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 06: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

En ST, `APRIETA(CLK := S1);` actualiza el detector y `IF APRIETA.Q THEN H1 := NOT H1; END_IF;` invierte la luz en el único ciclo del flanco. En Ladder, un contacto P de S1 da el pulso y un bloque XOR con H1 lo aplica. En FBD, un R_TRIG alimenta un XOR que vuelve a H1.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1** varias veces: cada pulsación cambia H1.
2. Mantén S1 apretado: H1 cambia una sola vez.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Una segunda luz H2 (Q0.1) que cambia al SOLTAR S1 (flanco de bajada).**

1. Ejecuta el ejemplo: cada pulsación cambia H1.
2. Mantén S1 apretado: H1 no parpadea, cambia una sola vez.
3. Agrega un flanco de bajada (F_TRIG) que cambie H2 al soltar.
4. Prueba varias pulsaciones.

> [!TIP] Qué te llevas
> Un flanco dura un solo ciclo: R_TRIG al apretar, F_TRIG al soltar. Con él una acción pasa una vez por pulsación.
