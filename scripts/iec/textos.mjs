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
  "iec-09": {
    descripcion: "Secuencias por etapas en IEC 61131-3: un semáforo con un bit por etapa, transiciones y un temporizador por etapa, en ST, Ladder y FBD.",
    intro: `Casi toda máquina trabaja por pasos: llenar, mezclar, vaciar; avanzar, esperar, volver. En C++ se arma con \`enum\` y \`switch\` (lección 11). En un PLC, el método clásico es el de las **etapas**: un bit por paso y una **transición** que dice cuándo se pasa al siguiente. Es la base del GRAFCET y del SFC, y se escribe igual en ST, Ladder y FBD.`,
    aprende: ["A dividir un proceso en etapas, con un bit por etapa (X1, X2, X3).", "A escribir cada transición como «etapa activa Y condición».", "La ecuación de una etapa: se activa con la transición que llega y se apaga con la que sale.", "A darle a cada etapa su propio temporizador y sus propias salidas."],
    idea: `### Etapas y transiciones

El semáforo tiene tres etapas: **X1** VERDE, **X2** AMARILLO y **X3** ROJO. Solo una está activa a la vez. Entre etapa y etapa hay una **transición**:

| Transición | De → a | Condición |
|---|---|---|
| T1 | VERDE → AMARILLO | pidió el peatón y pasaron 10 s, o pasaron 30 s |
| T2 | AMARILLO → ROJO | pasaron 3 s |
| T3 | ROJO → VERDE | pasaron 8 s |

Cada transición se escribe igual: **etapa de origen Y condición**, por ejemplo \`T2 := X2 AND FIN_AMA;\`.

### La ecuación de una etapa

Una etapa es un enclavamiento (lección 03): se **activa** con la transición que llega, se **mantiene** sola y se **apaga** con la transición que sale.

\`\`\`pascal
X2 := (X2 OR T1) AND NOT T2;
\`\`\`

En Ladder es un peldaño de marcha y parada: el contacto de la propia etapa en paralelo con el de la transición que llega, y en serie el contacto cerrado de la que sale.

### La etapa inicial

Al encender el PLC todas las etapas están en FALSE. Un bit **ARRANQUE**, verdadero solo en la primera vuelta del programa, activa la etapa inicial (X1).

### Las salidas, al final

Cada luz depende solo de su etapa: \`H3 := X1;\`. Así cada salida tiene una sola regla y es fácil ver qué la enciende.`,
    como: `El programa va en cuatro bloques, siempre en el mismo orden: los **temporizadores** de cada etapa (cuentan mientras su etapa está activa), las **transiciones**, las **etapas** y las **salidas**. Como todas las transiciones se calculan antes de mover las etapas, en cada vuelta se avanza como mucho un paso.

El pedido del peatón (\`PEATON\`) es otro enclavamiento: S1 lo activa y T2 lo borra, cuando el semáforo ya pasó a rojo.`,
    sim: ["Pulsa **Ejecutar**: el semáforo arranca en verde.", "Aprieta **S1** (botón del peatón): a los 10 s de verde pasa a amarillo 3 s y a rojo 8 s, con el verde peatonal encendido.", "Sin apretar S1, el verde dura 30 s.", ABRIR],
  },
  "iec-10": {
    descripcion: "Secuencia con un número de etapa en IEC 61131-3: CASE en ST, comparación y MOVE en Ladder, SEL en FBD, con un arranque estrella-triángulo.",
    intro: `En la lección 09 cada etapa tenía su propio bit. Otra forma, muy usada, es guardar **el número de la etapa** en una variable entera: \`ETAPA = 0\` parado, \`1\` estrella, \`2\` triángulo. Así nunca hay dos etapas activas a la vez y agregar una etapa es agregar un número.

El ejemplo es un **arranque estrella-triángulo**: el motor arranca en estrella (KM1 y KM2) para que la corriente de arranque sea menor y, a los 3 s, pasa a triángulo (KM1 y KM3).`,
    aprende: ["A guardar la etapa en una variable INT y a cambiarla con una asignación.", "CASE en ST: solo se revisan las condiciones de la etapa actual.", "En Ladder: un bloque EQ por etapa y un MOVE para pasar a la siguiente, con EN/ENO.", "En FBD: EQ para leer la etapa y SEL para escribirla."],
    idea: `### Un número en lugar de varios bits

| ETAPA | Nombre | KM1 | KM2 | KM3 |
|---|---|---|---|---|
| 0 | PARADO | | | |
| 1 | ESTRELLA | ✔ | ✔ | |
| 2 | TRIÁNGULO | ✔ | | ✔ |

### En ST: CASE

\`CASE ETAPA OF\` salta al bloque del número que tenga la etapa. Dentro de cada bloque va la transición: si se cumple la condición, se escribe el número siguiente.

\`\`\`pascal
CASE ETAPA OF
  0: IF S1 AND S0 THEN ETAPA := 1; END_IF;
  1: IF FIN_EST THEN ETAPA := 2; END_IF;
END_CASE;
\`\`\`

### En Ladder: comparar y MOVE

Ladder no tiene CASE. Se hace en dos pasos: primero un bloque **EQ** por etapa deja un bit (E0, E1, E2) en TRUE si \`ETAPA\` vale ese número; después, cada transición es un peldaño con los contactos de la etapa y su condición, que termina en un **MOVE** con el número siguiente. MOVE solo copia cuando le llega corriente a su entrada **EN**.

En el OpenPLC Editor, EQ y MOVE se conectan al riel por EN/ENO: en las propiedades del bloque marca **Execution control**.

### En FBD: SEL

\`SEL(G, IN0, IN1)\` entrega IN0 si G es FALSE e IN1 si G es TRUE. Con IN0 = ETAPA, la etapa queda igual hasta que la condición G pide la siguiente.`,
    como: `La parada va **después** del CASE y manda sobre todo: con S0 pulsado (S0 es NC, así que vale FALSE), \`ETAPA := 0\` en cualquier etapa. Las salidas se calculan al final a partir de la etapa: \`KM2 := ETAPA = 1;\`.

En Ladder, los bits E0 a E2 se calculan al principio de cada vuelta, así que un cambio de etapa se ve en las salidas en la vuelta siguiente, 20 ms después.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1**: cierran KM1 y KM2 (estrella).", "A los 3 s abre KM2 y cierra KM3 (triángulo).", "Aprieta **S0**: abren los tres contactores.", ABRIR],
  },
  "iec-11": {
    descripcion: "Bloques de función propios en IEC 61131-3: un FUNCTION_BLOCK MOTOR escrito en ST y usado con una instancia por bomba desde ST, Ladder y FBD.",
    intro: `Ya usaste bloques de la norma: TON, CTU, R_TRIG. Cada uno guarda sus datos y se usa con una **instancia** por equipo (\`T1\`, \`T2\`…). Con un **FUNCTION_BLOCK** propio haces lo mismo con tu lógica: la marcha y parada de un motor se escribe una vez y se usa en cada bomba. Es la misma idea que las clases de C++ (lección 12).`,
    aprende: ["A escribir un FUNCTION_BLOCK con entradas (VAR_INPUT), salidas (VAR_OUTPUT) y datos internos (VAR).", "A declarar una instancia por equipo y a llamarla desde ST, Ladder y FBD.", "Que cada instancia guarda sus propios datos: detener una bomba no toca a la otra."],
    idea: `### El bloque MOTOR

El bloque va en su propio archivo, \`pous/function-blocks/MOTOR.st\`, y se escribe en ST:

\`\`\`pascal
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
\`\`\`

- **VAR_INPUT** son las patas de la izquierda del bloque; **VAR_OUTPUT**, las de la derecha.
- **VAR** son sus datos internos: quedan guardados entre una vuelta y la siguiente, y nadie de afuera los toca.

### Una instancia por equipo

En el programa se declara una variable del tipo del bloque por cada bomba, igual que un TON:

\`\`\`pascal
VAR
  BOMBA1 : MOTOR;
  BOMBA2 : MOTOR;
END_VAR
\`\`\`

\`BOMBA1\` y \`BOMBA2\` tienen cada una su \`Q\` y su \`ARRANQUES\`. En Ladder y FBD el bloque MOTOR aparece en la lista de bloques del proyecto, con el nombre de la instancia encima.

### En el OpenPLC Editor

Se crea con **Agregar POU → Function Block**, lenguaje ST. Un bloque escrito en ST se usa igual desde un programa en Ladder o FBD.`,
    como: `\`BOMBA1(MARCHA := S1, PARADA := S2);\` llama al bloque con los pulsadores de la bomba 1, y \`BOMBA1.Q\` lee su salida. En Ladder, la primera entrada (MARCHA) y la primera salida (Q) del bloque van en el riel: el contacto S1 alimenta MARCHA y Q enciende la bobina KM1; PARADA se conecta aparte, con S2.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1**: arranca la bomba 1. **S2** la detiene.", "Abre \`pous/function-blocks/MOTOR.st\` en el panel del código para ver el bloque.", ABRIR],
  },
  "iec-12": {
    descripcion: "Proyecto de secuencias en IEC 61131-3: un portón automático por etapas, con finales de carrera, parada y barrera de seguridad, en ST, Ladder y FBD.",
    intro: `El proyecto de la unidad junta todo: etapas numeradas, transiciones, una parada que manda sobre todo y una seguridad que cambia el sentido. Un **portón automático** abre hasta un final de carrera, cierra hasta otro y, si la barrera ve algo mientras cierra, vuelve a abrir.`,
    aprende: ["A ordenar una máquina real en etapas antes de escribir el programa.", "A escribir la seguridad (parada, obstáculo) como transiciones más.", "A garantizar que dos salidas opuestas nunca estén juntas: cada una sale de una etapa distinta."],
    idea: `### Primero, las etapas

| ETAPA | Nombre | KM1 abrir | KM2 cerrar |
|---|---|---|---|
| 0 | PARADO | | |
| 1 | ABRIENDO | ✔ | |
| 2 | CERRANDO | | ✔ |

### Después, las transiciones

| De → a | Condición |
|---|---|
| PARADO → ABRIENDO | S1 y el portón no está abierto (NOT B1) |
| PARADO → CERRANDO | S2 y el portón no está cerrado (NOT B2) |
| ABRIENDO → PARADO | llegó al final B1 |
| CERRANDO → PARADO | llegó al final B2 |
| cualquiera → PARADO | parada S0 |

Con las dos tablas escritas, el programa sale solo: un bloque del CASE por etapa en ST, un peldaño con MOVE por transición en Ladder, un SEL por transición en FBD.

### Salidas opuestas

KM1 y KM2 juntos serían un cortocircuito en el motor. Como cada uno sale de una etapa distinta (\`KM1 := ETAPA = 1;\`, \`KM2 := ETAPA = 2;\`) y la etapa es un solo número, es imposible que estén los dos a la vez, sin enclavamientos extra.`,
    como: `El programa es el de la lección 10 con otras etapas. La parada va después del CASE para que mande sobre cualquier transición. En la práctica falta una transición: **CERRANDO → ABRIENDO con B3**, la barrera. Es una línea más en el CASE (un ELSIF), un peldaño más en Ladder o un SEL más en FBD.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1**: el portón abre hasta B1.", "Aprieta **S2**: cierra hasta B2. **S0** lo detiene donde esté.", ABRIR],
  },
  "iec-13": {
    descripcion: "Comparadores en IEC 61131-3: GE, LT, EQ y compañía convierten un número en una decisión. Una cinta que llena cajas con aviso previo, en ST, Ladder y FBD.",
    intro: `En la lección 07 el contador decidía solo: su salida Q se activaba al llegar a PV. Pero una máquina suele tomar **varias decisiones con la misma cuenta**: avisar cuando falta poco, parar al completar, encender otra cosa a mitad de camino. Para eso se compara la cuenta con cada número que importa.`,
    aprende: ["Los comparadores de la norma: EQ, NE, GT, GE, LT y LE; el resultado es un BOOL.", "A usar la cuenta (CV) de un contador en varias comparaciones.", "En Ladder, los comparadores se conectan por EN/ENO y dejan su resultado en un bit."],
    idea: `### Seis comparaciones

| Bloque | En ST | TRUE cuando |
|---|---|---|
| **EQ** | \`A = B\` | son iguales |
| **NE** | \`A <> B\` | son distintos |
| **GT** | \`A > B\` | A es mayor |
| **GE** | \`A >= B\` | A es mayor o igual |
| **LT** | \`A < B\` | A es menor |
| **LE** | \`A <= B\` | A es menor o igual |

### Un número, varias decisiones

\`\`\`pascal
KM1 := CUENTA < 10;   (* la cinta sigue mientras falten piezas *)
H1 := CUENTA >= 10;   (* caja llena *)
\`\`\`

Cada línea es una pregunta sobre el mismo número. Agregar un aviso a las 8 piezas es agregar una comparación, sin tocar el contador.`,
    como: `El contador queda con un PV alto (100): solo se usa su cuenta **CV**, que se copia a \`CUENTA\`. Las decisiones salen de las comparaciones. En Ladder cada comparación es un bloque **LT** o **GE** con *Execution control* (EN/ENO) en el riel, que escribe su resultado en un bit (KM1, H1). En FBD, el bloque recibe la cuenta y el número y su salida va directo a la variable.`,
    sim: ["Pulsa **Ejecutar**: la cinta (KM1) marcha.", "Toca **B1** diez veces: con la décima, la cinta para y H1 se enciende.", "**S1** vuelve la cuenta a cero.", ABRIR],
  },
  "iec-14": {
    descripcion: "Sumar y restar en IEC 61131-3: ADD y SUB en el flanco de un evento, con límites. Un estacionamiento con lugares libres, en ST, Ladder y FBD.",
    intro: `Un estacionamiento tiene una barrera de entrada y otra de salida. Cada auto que entra suma uno; cada uno que sale, resta uno. Con la cuenta se calcula cuántos lugares quedan y se enciende el cartel de **lleno**. Es la cuenta más simple que sube y baja, y la base de cualquier inventario.`,
    aprende: ["ADD y SUB: sumar y restar enteros (INT).", "A sumar en el flanco del evento, no mientras dure la señal.", "A calcular un valor a partir de otro (LIBRES := 5 - AUTOS) y compararlo."],
    idea: `### Sumar en el flanco

Si se escribe \`AUTOS := AUTOS + 1;\` con la barrera abierta, el programa suma uno **en cada vuelta**: cincuenta autos por segundo. Hay que sumar solo en el instante en que la barrera se abre, su **flanco de subida** (lección 06):

\`\`\`pascal
F_ENTRA(CLK := S1);
IF F_ENTRA.Q THEN
  AUTOS := AUTOS + 1;
END_IF;
\`\`\`

En Ladder, el contacto de flanco **^S1** (P) deja pasar corriente una sola vuelta y alimenta la entrada EN de un bloque **ADD**. En FBD, un **R_TRIG** da el flanco y un **SEL** elige entre la cuenta y la cuenta + 1.

### Calcular y comparar

\`LIBRES := 5 - AUTOS;\` es otro número que se calcula en cada vuelta. Con él, \`H1 := LIBRES > 0;\` y \`H2 := LIBRES <= 0;\`.`,
    como: `El ejemplo no tiene límites: un auto que entra con el estacionamiento lleno suma igual, y una salida de más deja la cuenta en negativo. En la vida real pasa (un sensor que rebota, un operador que prueba la barrera) y la cuenta deja de representar lo que hay. La práctica agrega una comparación antes de sumar y otra antes de restar.`,
    sim: ["Pulsa **Ejecutar**: H1 (verde) encendido.", "Toca **S1** cinco veces: con el quinto auto, H2 (lleno).", "Toca **S2**: sale un auto y vuelve el verde.", ABRIR],
  },
  "iec-15": {
    descripcion: "Contar el tiempo en IEC 61131-3: un TON que se reinicia solo da un pulso por segundo y ADD lo acumula. Un horómetro con aviso y bloqueo de mantenimiento, en ST, Ladder y FBD.",
    intro: `Los motores, compresores y bombas se mantienen por **horas de marcha**: cambio de aceite cada 500 h, rodamientos cada 2 000 h. El PLC lleva la cuenta con un **horómetro**, un número que sube mientras el equipo trabaja. En el Sim se cuenta en segundos para no esperar horas.`,
    aprende: ["Un generador de pulsos: un TON que se reinicia con su propia salida.", "A acumular tiempo en un INT sumando pulsos.", "A usar ese número en comparaciones: aviso y bloqueo de mantenimiento."],
    idea: `### Un pulso por segundo

\`\`\`pascal
T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
PULSO := T_SEG.Q;
\`\`\`

Con el motor en marcha, el TON cuenta 1 s y pone PULSO en TRUE. En la vuelta siguiente, \`NOT PULSO\` corta su entrada: el TON vuelve a cero y empieza otro segundo. PULSO dura **una sola vuelta**, justo lo que hace falta para sumar uno.

### Sumar los pulsos

\`\`\`pascal
IF PULSO THEN
  SEGUNDOS := SEGUNDOS + 1;
END_IF;
\`\`\`

Con el motor parado no hay pulsos y el horómetro se queda quieto: cuenta solo tiempo de marcha.`,
    como: `El ejemplo enciende H1 (mantenimiento) a los 20 s. En una planta, el aviso llega antes de que haga falta parar, para programar el trabajo, y el bloqueo llega después, si nadie lo hizo. La práctica arma las dos cosas con dos comparaciones sobre el mismo número: \`>= 10\` avisa y \`< 20\` deja marchar al motor. En Ladder, el bloqueo es un contacto más en el peldaño de la marcha, alimentado por un bloque LT.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1**: el motor marcha.", "Mira **SEGUNDOS** en las variables en vivo: sube uno por segundo.", "A los 20 s, H1 (mantenimiento) se enciende.", ABRIR],
  },
  "iec-16": {
    descripcion: "Proyecto de la unidad Comparar y calcular en IEC 61131-3: una cinta que arma lotes de piezas y cuenta los lotes de un turno, con sumas, comparaciones y flancos, en ST, Ladder y FBD.",
    intro: `El proyecto junta la unidad: una cinta que arma **lotes**. Cada pieza suma en el lote; con el lote completo la cinta para y avisa; el operador retira la caja y empieza otro con S1. En la práctica se agrega una segunda cuenta encima de la primera: los **lotes del turno**.`,
    aprende: ["A encadenar dos cuentas: piezas por lote y lotes por turno.", "A sumar en el flanco de una condición calculada (COMPLETO), no solo de una entrada.", "A ordenar el programa: contar, decidir, comparar y, al final, las salidas."],
    idea: `### Dos cuentas encadenadas

| Cuenta | Suma uno cuando | Se usa para |
|---|---|---|
| PIEZAS | pasa una pieza por B1, con la cinta en marcha | COMPLETO := PIEZAS >= 4 |
| LOTES | COMPLETO pasa de FALSE a TRUE | TURNO := LOTES >= 3 |

La segunda cuenta no mira un sensor: mira el **flanco de COMPLETO**, una variable del programa. Un R_TRIG (en Ladder, el contacto **^COMPLETO**) sirve igual con cualquier BOOL.

### El orden del programa

1. Contar las piezas.
2. Decidir si empieza un lote nuevo (S1 con el lote completo vuelve PIEZAS a 0).
3. Comparar: COMPLETO, TURNO.
4. Las salidas: la cinta y el piloto.

Con ese orden, todo lo que se decide en una vuelta se ve en las salidas de la misma vuelta.`,
    como: `\`IF F_PIEZA.Q AND KM1\` cuenta solo con la cinta en marcha: una pieza que se mueve con la cinta parada no es parte del lote. \`IF S1 AND COMPLETO THEN PIEZAS := 0\` es el lote nuevo; en Ladder es un **MOVE** de 0 a PIEZAS, y en FBD un **SEL** que elige 0. Como COMPLETO se calcula después, en la misma vuelta ya vale FALSE y la cinta arranca.`,
    sim: ["Pulsa **Ejecutar** y aprieta **S1**: la cinta marcha.", "Toca **B1** tres veces: el lote se completa, la cinta para y H1 se enciende.", "**S1** empieza un lote nuevo.", ABRIR],
  },
};
