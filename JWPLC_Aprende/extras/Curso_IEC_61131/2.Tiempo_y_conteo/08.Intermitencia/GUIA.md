<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-2/08-intermitencia-con-dos-temporizadores.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 08: Intermitencia con dos temporizadores

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 06 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/)

Un piloto que parpadea avisa más que uno fijo. En C++ se usa `millis()`; en un PLC, dos temporizadores que se pasan la posta: uno cuenta el tiempo apagado, el otro el encendido.

## Qué vas a aprender

- A armar un generador de pulsos con dos TON en anillo.
- Que el PLC nunca se detiene a esperar: los temporizadores cuentan mientras el resto del programa sigue.
- A elegir el tiempo encendido y el apagado por separado.

## Dos TON en anillo

1. **T_ON** cuenta mientras la luz está apagada. Al cumplir su tiempo, ENCENDIDO pasa a TRUE.
2. **T_OFF** cuenta mientras ENCENDIDO está en TRUE. Al cumplir su tiempo, APAGADO pasa a TRUE.
3. Con APAGADO en TRUE, la entrada de T_ON cae: T_ON se reinicia, ENCENDIDO vuelve a FALSE, T_OFF también se reinicia, y todo empieza otra vez.

El tiempo de T_ON es el apagado y el de T_OFF el encendido: con PT distintos, el parpadeo es asimétrico.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* piloto verde *)
    H2 AT %QX0.1 : BOOL; (* piloto amarillo *)
    H3 AT %QX0.2 : BOOL; (* piloto rojo *)
    T_ON         : TON;
    T_OFF        : TON;
    L_ON         : TON;
    L_OFF        : TON;
    ENCENDIDO    : BOOL;
    APAGADO      : BOOL;
    LENTO_ON     : BOOL;
    LENTO_OFF    : BOOL;
  END_VAR

  (* Dos TON en anillo: uno cuenta el tiempo apagado y el otro el
     encendido; al terminar el segundo, los dos vuelven a cero. *)
  T_ON(IN := NOT APAGADO, PT := T#500ms);
  ENCENDIDO := T_ON.Q;
  T_OFF(IN := ENCENDIDO, PT := T#500ms);
  APAGADO := T_OFF.Q;

  H1 := ENCENDIDO;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 641 438" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 641px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V120M627.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H488"/><path d="M516 50H627.5"/><path d="M227 90H257"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M77 58L83 42"/><rect x="257" y="14" width="66" height="100" rx="2"/><path d="M488 50H494M510 50H516"/><path d="M498 40Q492 50 498 60M506 40Q512 50 506 60"/></g><g transform="translate(6 192)"><path stroke-width="3" d="M1.5 -8V120M627.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H488"/><path d="M516 50H627.5"/><path d="M227 90H257"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="66" height="100" rx="2"/><path d="M488 50H494M510 50H516"/><path d="M498 40Q492 50 498 60M506 40Q512 50 506 60"/></g><g transform="translate(6 342)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Tiempo apagado: 500 ms &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">APAGADO</text><text x="290" y="27" text-anchor="middle" font-weight="700">TON</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;ON</text><text x="261" y="53.5" text-anchor="start" font-size="9">IN</text><text x="261" y="93.5" text-anchor="start" font-size="9">PT</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">ET</text><text x="502" y="32" text-anchor="middle" font-weight="600">ENCENDIDO</text><text x="223" y="94" text-anchor="end" font-weight="600">T#500ms</text></g><g transform="translate(6 192)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Tiempo encendido: 500 ms &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">ENCENDIDO</text><text x="290" y="27" text-anchor="middle" font-weight="700">TON</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;OFF</text><text x="261" y="53.5" text-anchor="start" font-size="9">IN</text><text x="261" y="93.5" text-anchor="start" font-size="9">PT</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">ET</text><text x="502" y="32" text-anchor="middle" font-weight="600">APAGADO</text><text x="223" y="94" text-anchor="end" font-weight="600">T#500ms</text></g><g transform="translate(6 342)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; H1 parpadea &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">ENCENDIDO</text><text x="196" y="32" text-anchor="middle" font-weight="600">H1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 08, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 736 396" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 736px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M-56 82H20"/><path d="M92 82H210"/><path d="M134 138H172V130H210"/><path d="M270 82H420"/><path d="M134 256H210"/><path d="M134 304H210"/><path d="M270 256H420"/><path d="M324 384H420"/><rect x="210" y="34" width="60" height="120" rx="2"/><rect x="20" y="34" width="72" height="72" rx="2"/><rect x="-168" y="66" width="128" height="32" rx="16"/><rect x="22" y="122" width="128" height="32" rx="16"/><rect x="420" y="66" width="128" height="32" rx="16"/><rect x="210" y="208" width="60" height="120" rx="2"/><rect x="22" y="240" width="128" height="32" rx="16"/><rect x="22" y="288" width="128" height="32" rx="16"/><rect x="420" y="240" width="128" height="32" rx="16"/><rect x="212" y="368" width="128" height="32" rx="16"/><rect x="420" y="368" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="240" y="47" text-anchor="middle" font-weight="700">TON</text><text x="240" y="29" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;ON</text><text x="214" y="85.5" text-anchor="start" font-size="9">IN</text><text x="214" y="133.5" text-anchor="start" font-size="9">PT</text><text x="266" y="85.5" text-anchor="end" font-size="9">Q</text><text x="266" y="133.5" text-anchor="end" font-size="9">ET</text><text x="56" y="47" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="85.5" text-anchor="start" font-size="9">IN</text><text x="88" y="85.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="86" text-anchor="middle" font-weight="600">APAGADO</text><text x="86" y="142" text-anchor="middle" font-weight="600">T#500ms</text><text x="484" y="86" text-anchor="middle" font-weight="600">ENCENDIDO</text><text x="240" y="221" text-anchor="middle" font-weight="700">TON</text><text x="240" y="203" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;OFF</text><text x="214" y="259.5" text-anchor="start" font-size="9">IN</text><text x="214" y="307.5" text-anchor="start" font-size="9">PT</text><text x="266" y="259.5" text-anchor="end" font-size="9">Q</text><text x="266" y="307.5" text-anchor="end" font-size="9">ET</text><text x="86" y="260" text-anchor="middle" font-weight="600">ENCENDIDO</text><text x="86" y="308" text-anchor="middle" font-weight="600">T#500ms</text><text x="484" y="260" text-anchor="middle" font-weight="600">APAGADO</text><text x="276" y="388" text-anchor="middle" font-weight="600">ENCENDIDO</text><text x="484" y="388" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 08: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

Las cuatro líneas de ST son el anillo: cada TON mira la salida del otro. Como un TON solo actualiza su salida cuando se lo llama, el programa sigue corriendo todo el tiempo; por eso cualquier otra línea (como `H2 := S1;` en la práctica) responde al instante.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar**: H1 parpadea cada medio segundo.
2. Cuenta el ritmo: medio segundo encendido y medio segundo apagado, mientras todo lo demás sigue respondiendo.
3. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**H3 (Q0.2) parpadea 2 s encendido y 2 s apagado, y H2 (Q0.1) sigue a S1 al instante.**

1. Ejecuta el ejemplo: H1 parpadea cada 500 ms.
2. Arma otra intermitencia, lenta, de 2 s y 2 s para H3.
3. H2 sigue a S1 sin esperar.
4. Mira las tres luces a la vez: ninguna frena a las otras.

> [!TIP] Qué te llevas
> Dos TON en anillo arman un generador de pulsos; el PLC nunca se detiene a esperar, por eso todo lo demás sigue respondiendo.
