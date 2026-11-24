<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-1/03-enclavamiento-marcha-y-parada.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 03: Enclavamiento: marcha y parada

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 08 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/)

Un motor se arranca con un pulsador que se suelta enseguida, pero tiene que seguir en marcha. El truco, tan viejo como los tableros de relés, es el **enclavamiento**: un contacto del propio contactor en paralelo con el pulsador de marcha.

## Qué vas a aprender

- El circuito de marcha y parada con enclavamiento (contacto de retención).
- Por qué la parada y el térmico se cablean normalmente cerrados.
- A escribir la misma lógica en una línea de ST: `KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;`.

## El enclavamiento

Al apretar MARCHA, KM1 se enciende. En el mismo instante su contacto, en paralelo con MARCHA, también deja pasar: al soltar el pulsador, KM1 se sostiene por su propio contacto. Solo se suelta cuando algo **en serie** abre el camino: PARADA o el térmico.

## Parada y térmico normalmente cerrados

PARADA y el contacto 95-96 del térmico están cerrados en reposo, así que sus entradas están **activas** mientras todo está bien. Si un cable se corta, la entrada cae a 0 y el motor para: es la falla segura. Por eso en el programa se usan con contacto abierto (en serie): «sigue si PARADA está activa».

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    MARCHA AT %IX0.0  : BOOL; (* S1, pulsador NA *)
    PARADA AT %IX0.1  : BOOL; (* S2, pulsador NC: activa en reposo *)
    TERMICO AT %IX0.2 : BOOL; (* F1, contacto 95-96 NC: activo si no hay falla *)
    KM1 AT %QX0.0     : BOOL; (* contactor del motor *)
    H1 AT %QX0.1      : BOOL; (* piloto de falla *)
    H2 AT %QX0.2      : BOOL; (* piloto de marcha *)
  END_VAR

  (* El motor queda en marcha por su propio contacto (enclavamiento):
     MARCHA lo arranca, KM1 lo mantiene; PARADA o el térmico lo sueltan. *)
  KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 571 190" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 571px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 10)"><path stroke-width="3" d="M1.5 8V160M557.5 8V160"/><path d="M214 50H304"/><path d="M328 50H418"/><path d="M446 50H557.5"/><path d="M3 50H23"/><path d="M27 50H72"/><path d="M96 50H141"/><path d="M25 51V142H72"/><path d="M96 142H143V51"/><path d="M145 50H190"/><rect data-sig="I0_0" x="69" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M72 50H79M79 40V60M89 40V60M89 50H96"/><rect data-sig="Q0_0" x="69" y="129" width="30" height="26" rx="4" stroke="none"/><path d="M72 142H79M79 132V152M89 132V152M89 142H96"/><rect data-sig="I0_1" x="187" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M190 50H197M197 40V60M207 40V60M207 50H214"/><rect data-sig="I0_2" x="301" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M304 50H311M311 40V60M321 40V60M321 50H328"/><rect data-sig="Q0_0" x="415" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M418 50H424M440 50H446"/><path d="M428 40Q422 50 428 60M436 40Q442 50 436 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 10)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Marcha y parada con enclavamiento &#42;)</text><text x="84" y="32" text-anchor="middle" font-weight="600">MARCHA</text><text x="84" y="124" text-anchor="middle" font-weight="600">KM1</text><text x="202" y="32" text-anchor="middle" font-weight="600">PARADA</text><text x="316" y="32" text-anchor="middle" font-weight="600">TERMICO</text><text x="432" y="32" text-anchor="middle" font-weight="600">KM1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 03, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 0 658 202" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 658px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M162 36H231V68H300"/><path d="M162 76H231V116H300"/><path d="M384 68H450"/><path d="M312 136H381V116H450"/><path d="M312 176H381V164H450"/><path d="M534 68H547V36H560"/><rect x="450" y="20" width="84" height="168" rx="2"/><rect x="300" y="20" width="84" height="120" rx="2"/><rect x="50" y="20" width="128" height="32" rx="16"/><rect x="50" y="60" width="128" height="32" rx="16"/><rect x="200" y="120" width="128" height="32" rx="16"/><rect x="200" y="160" width="128" height="32" rx="16"/><rect x="560" y="20" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="492" y="33" text-anchor="middle" font-weight="700">AND</text><text x="454" y="71.5" text-anchor="start" font-size="9">IN1</text><text x="454" y="119.5" text-anchor="start" font-size="9">IN2</text><text x="454" y="167.5" text-anchor="start" font-size="9">IN3</text><text x="530" y="71.5" text-anchor="end" font-size="9">OUT</text><text x="342" y="33" text-anchor="middle" font-weight="700">OR</text><text x="304" y="71.5" text-anchor="start" font-size="9">IN1</text><text x="304" y="119.5" text-anchor="start" font-size="9">IN2</text><text x="380" y="71.5" text-anchor="end" font-size="9">OUT</text><text x="114" y="40" text-anchor="middle" font-weight="600">MARCHA</text><text x="114" y="80" text-anchor="middle" font-weight="600">KM1</text><text x="264" y="140" text-anchor="middle" font-weight="600">PARADA</text><text x="264" y="180" text-anchor="middle" font-weight="600">TERMICO</text><text x="624" y="40" text-anchor="middle" font-weight="600">KM1</text></g></svg>
<figcaption>FBD de la lección 03: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

`KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;` se lee igual que el peldaño: «KM1 queda encendido si (se aprieta MARCHA o ya estaba encendido) y PARADA no está apretada y el térmico está bien». KM1 aparece a los dos lados: el valor de la derecha es el del ciclo anterior. En FBD es un OR que entra a un AND de tres entradas.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1** (MARCHA): KM1 arranca y sigue al soltarlo.
2. Aprieta **S2** (PARADA): el motor para.
3. Arranca otra vez y aprieta **F1**: el térmico dispara y el motor para. Al rearmarlo, el motor **no** vuelve solo.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Piloto de marcha H2 (Q0.2) con el motor y piloto de falla H1 (Q0.1) mientras el térmico esté disparado.**

1. Ejecuta el ejemplo: MARCHA arranca KM1 y sigue en marcha al soltarla.
2. Agrega H2 encendido mientras el motor marcha.
3. Agrega H1 encendido mientras el térmico (F1) esté disparado.
4. Comprueba que al rearmar el térmico el motor NO arranca solo.

> [!TIP] Qué te llevas
> El enclavamiento es un contacto de KM1 en paralelo con MARCHA: la salida se mantiene sola hasta que algo en serie la corta.
