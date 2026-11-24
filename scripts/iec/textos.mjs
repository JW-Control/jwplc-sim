// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Textos de la ruta IEC 61131-3 (wiki y README.md de cada lección). Markdown.
//   descripcion  una línea para la wiki (frontmatter)
//   intro        párrafos de entrada
//   aprende      «Qué vas a aprender»
//   idea         la idea de la lección (secciones con ###)
//   como         «Cómo funciona el programa» (uno o varios párrafos)
//   sim          pasos de «En JWPLC Sim»

const ABRIR = `Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.`;

export const TEXTOS = {
  "iec-01": {
    descripcion: "Variables ubicadas (%IX, %QX), contactos y bobinas: el primer programa IEC 61131-3 del JWPLC Basic en ST, Ladder y FBD.",
    intro: `El JWPLC Basic también se programa con los lenguajes de la norma **IEC 61131-3**, los mismos de cualquier PLC industrial: texto estructurado (**ST**), diagrama de contactos (**Ladder**, LD) y diagrama de bloques de función (**FBD**). Se escriben en el **OpenPLC Editor** y se prueban en **JWPLC Sim** con el mismo banco que la ruta en C++.

En esta lección vas a hacer el programa más corto posible: una luz que sigue a un pulsador. Lo vas a ver en los tres lenguajes, porque los tres dicen lo mismo.`,
    aprende: ["Qué es una variable ubicada: `AT %IX0.0` es la entrada I0.0 y `AT %QX0.0` la salida Q0.0.", "Qué son un contacto y una bobina, y cómo se escriben en ST y FBD.", "A invertir una entrada: contacto cerrado en Ladder, `NOT` en ST, bloque NOT en FBD."],
    idea: `### Variables ubicadas

En IEC 61131-3 cada entrada y salida de la placa es una dirección: \`%IX0.0\` a \`%IX0.7\` son las entradas I0.0 a I0.7 y \`%QX0.0\` a \`%QX0.7\` las salidas Q0.0 a Q0.7 (la X dice que son de un bit, BOOL). En el programa se les da un nombre que diga qué son:

\`\`\`iecst
VAR
  S1 AT %IX0.0 : BOOL;  (* pulsador *)
  H1 AT %QX0.0 : BOOL;  (* piloto *)
END_VAR
\`\`\`

Desde ahí, el programa habla de \`S1\` y \`H1\`, no de bornes. Si mañana el pulsador pasa a otra entrada, se cambia una sola línea.

### Contactos y bobinas

En Ladder, una **bobina** es una salida que se enciende cuando le llega corriente desde el riel de la izquierda; un **contacto abierto** deja pasar la corriente si su variable está en TRUE, y un **contacto cerrado** (con la barra) la deja pasar si está en FALSE. En ST lo mismo es una asignación: \`H1 := S1;\`. En FBD, una variable de entrada unida con un hilo a una de salida.

| Ladder | ST | FBD |
|---|---|---|
| Contacto abierto de S1 | \`S1\` | Variable S1 |
| Contacto cerrado de S1 | \`NOT S1\` | Bloque NOT |
| Bobina de H1 | \`H1 := …;\` | Variable de salida H1 |`,
    como: `El PLC repite su ciclo sin parar (cada 20 ms en estos proyectos): lee las entradas, ejecuta el programa de arriba abajo y escribe las salidas. En cada ciclo, \`H1 := S1;\` copia el estado del pulsador al piloto. No hay \`if\` ni espera: la salida sigue a la entrada mientras el programa corre.`,
    sim: ["Pulsa **Ejecutar**: el Sim compila el proyecto con la misma cadena que el OpenPLC Editor.", "En **Mandos** mantén apretado **S1**: `%IX0.0` se activa y H1 se enciende. Al soltarlo, se apaga.", "Mira la pestaña **Programa**: en ST puedes cambiar el código ahí mismo; Ladder y FBD se abren en el OpenPLC Editor.", ABRIR],
  },
  "iec-02": {
    descripcion: "Lógica Y, O y NO en IEC 61131-3: contactos en serie y en paralelo, AND, OR y NOT. Una prensa a dos manos en ST, Ladder y FBD.",
    intro: `Casi toda la lógica de un tablero se arma con tres palabras: **Y**, **O** y **NO**. Una prensa que baja solo con las dos manos del operario en los mandos (Y), una alarma que suena con cualquiera de dos sensores (O), una luz que avisa que algo NO está.`,
    aprende: ["Y (AND): contactos en serie.", "O (OR): contactos en paralelo.", "NO (NOT): contacto cerrado.", "Que un bloque AND u OR de FBD admite más de dos entradas."],
    idea: `### Serie es Y, paralelo es O

En Ladder la corriente va del riel izquierdo a la bobina. Con dos contactos **en serie**, tiene que pasar por los dos: la bobina se enciende con SA1 **y** SA2. Con dos contactos **en paralelo**, le alcanza uno de los dos caminos: SA1 **o** SA2.

| Idea | Ladder | ST | FBD |
|---|---|---|---|
| Y | Contactos en serie | \`SA1 AND SA2\` | Bloque AND |
| O | Contactos en paralelo | \`SA1 OR SA2\` | Bloque OR |
| NO | Contacto cerrado | \`NOT SA1\` | Bloque NOT |

### La prensa a dos manos

Una prensa no baja si el operario tiene una mano libre: podría estar debajo. Por eso pide dos mandos, uno para cada mano, y baja solo con los dos apretados. Es la Y más famosa de la industria.`,
    como: `Cada salida tiene su propia línea (un peldaño en Ladder, una red en FBD). \`H1 := SA1 AND SA2;\` baja la prensa con las dos manos; \`H2 := SA1 OR SA2;\` se enciende con cualquiera; \`H3 := NOT SA1;\` está encendido mientras SA1 está suelto. Las tres se calculan en cada ciclo, una después de la otra.`,
    sim: ["Pulsa **Ejecutar** y mueve los selectores **SA1** y **SA2** en **Mandos** (en el banco son las manos).", "Con uno solo, H1 queda apagado; con los dos, se enciende. H2 se enciende con cualquiera.", "H3 está encendido mientras SA1 está en 0.", ABRIR],
  },
  "iec-03": {
    descripcion: "Enclavamiento en IEC 61131-3: marcha y parada de un motor con contacto de retención, parada y térmico normalmente cerrados, en ST, Ladder y FBD.",
    intro: `Un motor se arranca con un pulsador que se suelta enseguida, pero tiene que seguir en marcha. El truco, tan viejo como los tableros de relés, es el **enclavamiento**: un contacto del propio contactor en paralelo con el pulsador de marcha.`,
    aprende: ["El circuito de marcha y parada con enclavamiento (contacto de retención).", "Por qué la parada y el térmico se cablean normalmente cerrados.", "A escribir la misma lógica en una línea de ST: `KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;`."],
    idea: `### El enclavamiento

Al apretar MARCHA, KM1 se enciende. En el mismo instante su contacto, en paralelo con MARCHA, también deja pasar: al soltar el pulsador, KM1 se sostiene por su propio contacto. Solo se suelta cuando algo **en serie** abre el camino: PARADA o el térmico.

### Parada y térmico normalmente cerrados

PARADA y el contacto 95-96 del térmico están cerrados en reposo, así que sus entradas están **activas** mientras todo está bien. Si un cable se corta, la entrada cae a 0 y el motor para: es la falla segura. Por eso en el programa se usan con contacto abierto (en serie): «sigue si PARADA está activa».`,
    como: `\`KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;\` se lee igual que el peldaño: «KM1 queda encendido si (se aprieta MARCHA o ya estaba encendido) y PARADA no está apretada y el térmico está bien». KM1 aparece a los dos lados: el valor de la derecha es el del ciclo anterior. En FBD es un OR que entra a un AND de tres entradas.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1** (MARCHA): KM1 arranca y sigue al soltarlo.", "Aprieta **S2** (PARADA): el motor para.", "Arranca otra vez y aprieta **F1**: el térmico dispara y el motor para. Al rearmarlo, el motor **no** vuelve solo.", ABRIR],
  },
  "iec-04": {
    descripcion: "Set y reset en IEC 61131-3: bobinas S y R, bloques SR y RS e IF en ST. Una falla del térmico que se memoriza hasta reconocerla.",
    intro: `El enclavamiento guarda un estado con un contacto en paralelo. La norma trae otra forma, más directa: **set** (poner en TRUE) y **reset** (poner en FALSE). Lo que se pone en set queda así hasta que algo lo resetea, aunque la condición desaparezca.`,
    aprende: ["Las bobinas S (set) y R (reset) de Ladder.", "Los bloques SR y RS de FBD: cuál gana si las dos entradas están activas.", "El equivalente en ST con dos IF.", "A memorizar una falla hasta que alguien la reconozca."],
    idea: `### Set y reset

| Ladder | ST | FBD |
|---|---|---|
| Bobina **S** | \`IF … THEN KM1 := TRUE; END_IF;\` | Entrada S de SR/RS |
| Bobina **R** | \`IF … THEN KM1 := FALSE; END_IF;\` | Entrada R de SR/RS |

Si set y reset están activos a la vez, gana el que se escribe **último** en el programa. En FBD lo dice el nombre del bloque: **SR** da prioridad al set (la S va primero en el nombre) y **RS** al reset. Para un motor se usa **RS**: con PARADA apretada no arranca aunque también se apriete MARCHA.

### Memorizar una falla

Cuando el térmico dispara, el motor para. Pero si el térmico se rearma solo y nadie se entera, el problema sigue ahí. Por eso la falla se **memoriza**: una variable FALLA se pone en set con el térmico abierto y solo se resetea cuando el operario la reconoce (aquí, apretando PARADA con el térmico ya normal).`,
    como: `El ejemplo pone KM1 en TRUE con MARCHA y lo vuelve a FALSE con PARADA o el térmico. El reset está escrito después del set, así que gana. En Ladder son dos peldaños, uno con la bobina S y otro con la R; en FBD, un bloque RS con un OR en su entrada de reset.`,
    sim: ["Pulsa **Ejecutar**: MARCHA (S1) pone KM1 y PARADA (S2) lo quita.", "Dispara el térmico con **F1** y suéltalo: el motor queda parado.", "En la práctica, la falla queda encendida en H1 hasta reconocerla con PARADA.", ABRIR],
  },
  "iec-05": {
    descripcion: "Temporizadores TON y TOF de IEC 61131-3: retardo a la conexión y a la desconexión, instancias, PT y Q, en ST, Ladder y FBD.",
    intro: `Un arranque que espera unos segundos, una luz de pasillo que sigue encendida un rato después de que pasó la gente, una alarma si algo dura demasiado: todo eso son **temporizadores**. La norma trae los mismos en todos los PLC: TON, TOF y TP.`,
    aprende: ["TON: retardo a la conexión.", "TOF: retardo a la desconexión.", "Qué es una instancia: cada temporizador tiene su nombre y su memoria.", "Las entradas IN y PT y las salidas Q y ET.", "Los tiempos en IEC: `T#3s`, `T#500ms`, `T#1m30s`."],
    idea: `### TON y TOF

| Bloque | Q se enciende | Q se apaga |
|---|---|---|
| **TON** | cuando IN lleva PT en TRUE | en cuanto IN vuelve a FALSE |
| **TOF** | en cuanto IN pasa a TRUE | cuando IN lleva PT en FALSE |

**ET** (tiempo transcurrido) dice cuánto lleva contando. **TP** da un pulso de duración PT y no se usa en esta lección.

### Una instancia por uso

Un temporizador es un **bloque de función**: tiene memoria (cuánto lleva contando). Por eso se declara como una variable, \`ARRANQUE : TON;\`, y cada uso necesita la suya. Dos temporizadores con el mismo nombre serían el mismo reloj.`,
    como: `\`ARRANQUE(IN := S1, PT := T#3s);\` llama al temporizador en cada ciclo con el estado de S1; \`H1 := ARRANQUE.Q;\` copia su salida al piloto. En Ladder el bloque va en el peldaño: la corriente del contacto entra por IN y la salida Q sigue hacia la bobina. En FBD, la variable S1 va a IN y Q a la variable H1.`,
    sim: ["Pulsa **Ejecutar** y mantén **S1** apretado: H1 se enciende a los 3 s.", "Activa la presencia **B1**: el pasillo (H2) se enciende al instante; al quitarla, sigue 10 s más.", "En la práctica cambias los tiempos y agregas la bocina.", ABRIR],
  },
  "iec-06": {
    descripcion: "Flancos en IEC 61131-3: R_TRIG y F_TRIG, contactos P y N de Ladder. Un telerruptor que enciende y apaga con un pulsador, en ST, Ladder y FBD.",
    intro: `Un pulsador que enciende la luz y, a la siguiente pulsación, la apaga: el **telerruptor**. Si el programa mirara solo «está apretado», la luz cambiaría en cada ciclo mientras se mantiene el dedo, decenas de veces por segundo. Lo que interesa es el **instante** en que cambia: el flanco.`,
    aprende: ["Flanco de subida (R_TRIG, contacto P) y de bajada (F_TRIG, contacto N).", "Que un flanco dura un solo ciclo.", "A cambiar una salida con XOR: `H1 := H1 XOR PULSO;`."],
    idea: `### Un ciclo de largo

**R_TRIG** mira su entrada CLK en cada ciclo y da Q = TRUE **solo en el ciclo** en que CLK pasó de FALSE a TRUE. **F_TRIG** hace lo mismo al pasar de TRUE a FALSE. En Ladder son los contactos con **P** (positivo) y **N** (negativo).

### Cambiar con XOR

XOR (O exclusivo) da TRUE cuando sus dos entradas son distintas. \`H1 XOR PULSO\` deja H1 como estaba si no hay pulso y lo invierte en el ciclo del pulso: justo el telerruptor.`,
    como: `En ST, \`APRIETA(CLK := S1);\` actualiza el detector y \`IF APRIETA.Q THEN H1 := NOT H1; END_IF;\` invierte la luz en el único ciclo del flanco. En Ladder, un contacto P de S1 da el pulso y un bloque XOR con H1 lo aplica. En FBD, un R_TRIG alimenta un XOR que vuelve a H1.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1** varias veces: cada pulsación cambia H1.", "Mantén S1 apretado: H1 cambia una sola vez.", ABRIR],
  },
  "iec-07": {
    descripcion: "Contadores en IEC 61131-3: CTU, sus entradas CU, R y PV y sus salidas Q y CV. Una cinta que llena cajas, en ST, Ladder y FBD.",
    intro: `Una cinta lleva piezas a una caja; un sensor las ve pasar. Al llegar a la cantidad de la caja, la cinta para y avisa. Contar es otra de las tareas de todos los días de un PLC, y la norma trae sus contadores listos.`,
    aprende: ["CTU, el contador ascendente: CU, R, PV, Q y CV.", "Que CTU cuenta flancos, no ciclos: una pieza es una sola cuenta.", "A usar la cuenta (CV) como un número entero (INT)."],
    idea: `### CTU

| Pin | Qué es |
|---|---|
| **CU** | Cada flanco de subida suma uno |
| **R** | Con TRUE, la cuenta vuelve a cero |
| **PV** | La meta (valor preestablecido) |
| **Q** | TRUE cuando la cuenta llegó a PV |
| **CV** | La cuenta actual (INT) |

También hay **CTD** (cuenta hacia abajo desde PV) y **CTUD** (las dos cosas). Como TON, un contador es un bloque de función: cada uno se declara con su nombre, \`PIEZAS : CTU;\`.`,
    como: `\`PIEZAS(CU := B1, R := FALSE, PV := 10);\` cuenta cada pieza que pasa por B1. \`LLENA := PIEZAS.Q;\` se pone en TRUE con 10; la cinta (\`KM1 := NOT LLENA;\`) para y H1 avisa. En el ejemplo R está fijo en FALSE: la caja nunca se vacía. En Ladder, el contacto B1 alimenta CU; PV y R son pines del bloque.`,
    sim: ["Pulsa **Ejecutar**: la cinta (KM1) marcha.", "Toca **B1** diez veces: con la décima, la cinta para y H1 se enciende.", "En la práctica la caja es de 24 y RESET (S1) empieza otra.", ABRIR],
  },
  "iec-08": {
    descripcion: "Intermitencia con dos TON en IEC 61131-3: un generador de pulsos que no detiene el programa, en ST, Ladder y FBD.",
    intro: `Un piloto que parpadea avisa más que uno fijo. En C++ se usa \`millis()\`; en un PLC, dos temporizadores que se pasan la posta: uno cuenta el tiempo apagado, el otro el encendido.`,
    aprende: ["A armar un generador de pulsos con dos TON en anillo.", "Que el PLC nunca se detiene a esperar: los temporizadores cuentan mientras el resto del programa sigue.", "A elegir el tiempo encendido y el apagado por separado."],
    idea: `### Dos TON en anillo

1. **T_ON** cuenta mientras la luz está apagada. Al cumplir su tiempo, ENCENDIDO pasa a TRUE.
2. **T_OFF** cuenta mientras ENCENDIDO está en TRUE. Al cumplir su tiempo, APAGADO pasa a TRUE.
3. Con APAGADO en TRUE, la entrada de T_ON cae: T_ON se reinicia, ENCENDIDO vuelve a FALSE, T_OFF también se reinicia, y todo empieza otra vez.

El tiempo de T_ON es el apagado y el de T_OFF el encendido: con PT distintos, el parpadeo es asimétrico.`,
    como: `Las cuatro líneas de ST son el anillo: cada TON mira la salida del otro. Como un TON solo actualiza su salida cuando se lo llama, el programa sigue corriendo todo el tiempo; por eso cualquier otra línea (como \`H2 := S1;\` en la práctica) responde al instante.`,
    sim: ["Pulsa **Ejecutar**: H1 parpadea cada medio segundo.", "Cuenta el ritmo: medio segundo encendido y medio segundo apagado, mientras todo lo demás sigue respondiendo.", ABRIR],
  },
};
