<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-2/05-temporizadores-ton-y-tof.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 05: Temporizadores TON y TOF

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 09 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/)

Un arranque que espera unos segundos, una luz de pasillo que sigue encendida un rato después de que pasó la gente, una alarma si algo dura demasiado: todo eso son **temporizadores**. La norma trae los mismos en todos los PLC: TON, TOF y TP.

## Qué vas a aprender

- TON: retardo a la conexión.
- TOF: retardo a la desconexión.
- Qué es una instancia: cada temporizador tiene su nombre y su memoria.
- Las entradas IN y PT y las salidas Q y ET.
- Los tiempos en IEC: `T#3s`, `T#500ms`, `T#1m30s`.

## TON y TOF

| Bloque | Q se enciende | Q se apaga |
|---|---|---|
| **TON** | cuando IN lleva PT en TRUE | en cuanto IN vuelve a FALSE |
| **TOF** | en cuanto IN pasa a TRUE | cuando IN lleva PT en FALSE |

**ET** (tiempo transcurrido) dice cuánto lleva contando. **TP** da un pulso de duración PT y no se usa en esta lección.

## Una instancia por uso

Un temporizador es un **bloque de función**: tiene memoria (cuánto lleva contando). Por eso se declara como una variable, `ARRANQUE : TON;`, y cada uso necesita la suya. Dos temporizadores con el mismo nombre serían el mismo reloj.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* arranque *)
    B1 AT %IX0.1  : BOOL; (* presencia (selector) *)
    H1 AT %QX0.0  : BOOL; (* arranque *)
    H2 AT %QX0.1  : BOOL; (* luz del pasillo *)
    HA1 AT %QX0.2 : BOOL; (* bocina *)
    ARRANQUE      : TON;
    PASILLO       : TOF;
    BOCINA        : TON;
  END_VAR

  (* TON: H1 se enciende cuando S1 lleva 3 s apretado. *)
  ARRANQUE(IN := S1, PT := T#3s);
  H1 := ARRANQUE.Q;

  (* TOF: la luz del pasillo sigue 10 s después de la última presencia. *)
  PASILLO(IN := B1, PT := T#10s);
  H2 := PASILLO.Q;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 641 332" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 641px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V120M627.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H488"/><path d="M516 50H627.5"/><path d="M227 90H257"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="66" height="100" rx="2"/><rect data-sig="Q0_0" x="485" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M488 50H494M510 50H516"/><path d="M498 40Q492 50 498 60M506 40Q512 50 506 60"/></g><g transform="translate(6 192)"><path stroke-width="3" d="M1.5 -8V120M627.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M323 50H488"/><path d="M516 50H627.5"/><path d="M227 90H257"/><rect data-sig="I0_1" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="66" height="100" rx="2"/><rect data-sig="Q0_1" x="485" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M488 50H494M510 50H516"/><path d="M498 40Q492 50 498 60M506 40Q512 50 506 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; TON: retardo a la conexión &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">S1</text><text x="290" y="27" text-anchor="middle" font-weight="700">TON</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">ARRANQUE</text><text x="261" y="53.5" text-anchor="start" font-size="9">IN</text><text x="261" y="93.5" text-anchor="start" font-size="9">PT</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">ET</text><text x="502" y="32" text-anchor="middle" font-weight="600">H1</text><text x="223" y="94" text-anchor="end" font-weight="600">T#3s</text></g><g transform="translate(6 192)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; TOF: retardo a la desconexión &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">B1</text><text x="290" y="27" text-anchor="middle" font-weight="700">TOF</text><text x="290" y="9" text-anchor="middle" font-style="italic" opacity="0.8">PASILLO</text><text x="261" y="53.5" text-anchor="start" font-size="9">IN</text><text x="261" y="93.5" text-anchor="start" font-size="9">PT</text><text x="319" y="53.5" text-anchor="end" font-size="9">Q</text><text x="319" y="93.5" text-anchor="end" font-size="9">ET</text><text x="502" y="32" text-anchor="middle" font-weight="600">H2</text><text x="223" y="94" text-anchor="end" font-weight="600">T#10s</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 05, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 0 508 330" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 508px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 36H81V68H150"/><path d="M12 76H81V116H150"/><path d="M210 68H235V36H260"/><path d="M12 216H81V248H150"/><path d="M12 256H81V296H150"/><path d="M210 248H235V216H260"/><rect x="150" y="20" width="60" height="120" rx="2"/><rect x="-100" y="20" width="128" height="32" rx="16"/><rect x="-100" y="60" width="128" height="32" rx="16"/><rect x="260" y="20" width="128" height="32" rx="16"/><rect x="150" y="200" width="60" height="120" rx="2"/><rect x="-100" y="200" width="128" height="32" rx="16"/><rect x="-100" y="240" width="128" height="32" rx="16"/><rect x="260" y="200" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="180" y="33" text-anchor="middle" font-weight="700">TON</text><text x="180" y="15" text-anchor="middle" font-style="italic" opacity="0.8">ARRANQUE</text><text x="154" y="71.5" text-anchor="start" font-size="9">IN</text><text x="154" y="119.5" text-anchor="start" font-size="9">PT</text><text x="206" y="71.5" text-anchor="end" font-size="9">Q</text><text x="206" y="119.5" text-anchor="end" font-size="9">ET</text><text x="-36" y="40" text-anchor="middle" font-weight="600">S1</text><text x="-36" y="80" text-anchor="middle" font-weight="600">T#3s</text><text x="324" y="40" text-anchor="middle" font-weight="600">H1</text><text x="180" y="213" text-anchor="middle" font-weight="700">TOF</text><text x="180" y="195" text-anchor="middle" font-style="italic" opacity="0.8">PASILLO</text><text x="154" y="251.5" text-anchor="start" font-size="9">IN</text><text x="154" y="299.5" text-anchor="start" font-size="9">PT</text><text x="206" y="251.5" text-anchor="end" font-size="9">Q</text><text x="206" y="299.5" text-anchor="end" font-size="9">ET</text><text x="-36" y="220" text-anchor="middle" font-weight="600">B1</text><text x="-36" y="260" text-anchor="middle" font-weight="600">T#10s</text><text x="324" y="220" text-anchor="middle" font-weight="600">H2</text></g></svg>
<figcaption>FBD de la lección 05: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

`ARRANQUE(IN := S1, PT := T#3s);` llama al temporizador en cada ciclo con el estado de S1; `H1 := ARRANQUE.Q;` copia su salida al piloto. En Ladder el bloque va en el peldaño: la corriente del contacto entra por IN y la salida Q sigue hacia la bobina. En FBD, la variable S1 va a IN y Q a la variable H1.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y mantén **S1** apretado: H1 se enciende a los 3 s.
2. Activa la presencia **B1**: el pasillo (H2) se enciende al instante; al quitarla, sigue 10 s más.
3. En la práctica cambias los tiempos y agregas la bocina.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Arranque a los 2 s, luz de pasillo de 5 s y una bocina si la presencia dura más de 30 s.**

1. Ejecuta el ejemplo: mantén S1 3 s y activa la presencia B1.
2. Cambia el arranque a 2 s y la luz del pasillo a 5 s (PT).
3. Agrega un tercer temporizador: HA1 (Q0.2) suena si la presencia dura más de 30 s.
4. Prueba los tres tiempos.

> [!TIP] Qué te llevas
> TON retrasa el encendido, TOF retrasa el apagado; cada uso es una instancia con su nombre y su tiempo PT.
