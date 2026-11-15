# Propuesta: evaluaciones en vivo, con CRUMB como referencia

Estado (2026-11-14), rama `feature/alpha18-evaluaciones`: etapa 1 (objetivos
en vivo en los ejercicios 01 y 09) y etapa 2 (ficha del reto y centro de
aprendizaje, en los 9 ejercicios) hechas; ver `docs/EJERCICIOS.md`.
Etapas 3 y 4: pendientes. Decisiones tomadas por defecto: niveles con
candado y casilla del docente para abrir todo; progreso solo local.

## Qué hace CRUMB

[CRUMB](https://crumbsim.com/) es un simulador de circuitos en 3D. Su
campaña de aprendizaje ([guía](https://crumbsim.com/guide/learning/)) se
organiza así:

- **Centro de aprendizaje.** Diez niveles. Un nivel se abre al terminar
  todos los retos del anterior. Dentro de un nivel, los retos se hacen en
  cualquier orden. El siguiente reto aparece marcado como «a continuación»,
  los terminados llevan un visto y los bloqueados un candado.
- **Ficha del reto.** Antes de empezar muestra tres cosas: **el objetivo**
  (por ejemplo, una corriente dentro de un rango durante cierto tiempo),
  **los pasos** y **las piezas que se pueden agregar**. Se empieza con un
  botón y la ficha se puede volver a abrir.
- **Banco restringido.** Las piezas que ya están en el banco no se pueden
  cambiar ni quitar. La caja de herramientas solo ofrece las piezas
  permitidas, con cuántas quedan. Si el alumno intenta algo no permitido,
  aparece una nota junto al puntero que explica por qué.
- **Verificación en vivo.** Al correr la simulación, el panel lista cada
  objetivo con la lectura actual, el rango que debe cumplir y una barra que
  se llena mientras la lectura se mantiene en rango (unos segundos de tiempo
  simulado). El reto se completa cuando todos los objetivos se cumplen en la
  misma corrida. Si el alumno recablea, los objetivos se reinician.
- **Pistas.** Mientras el reto no esté terminado, aparecen globos que
  señalan una pieza o un agujero de la protoboard.
- **Mérito y distinción.** Objetivos extra que nunca impiden completar el
  reto.
- **Al terminar.** Una celebración breve y **qué enseña** el reto.

Ojo: lo anterior sale de su documentación. No probé la interfaz, y CRUMB
Advanced figura como «próximamente».

## Qué tenemos hoy en JWPLC Sim

Nueve ejercicios (`exercises/`) con enunciado, escena cableada y
`rubrica.json`. **Calificar** compila el sketch, corre cada caso con
acciones programadas (por ejemplo, «a los 0 ms, S1 a la posición 1») y da
una nota de 0 a 20, con el detalle de qué falló y en qué instante. La
calificación es determinista y sirve para dar nota. Lo que falta es la parte
que enseña mientras el alumno prueba.

| | CRUMB | JWPLC Sim hoy |
|---|---|---|
| Cuándo evalúa | En vivo, mientras el alumno opera | Al final, en una corrida programada |
| Qué ve el alumno | Barras por objetivo, en tiempo real | Nota y lista de verificaciones |
| Progreso | Niveles, desbloqueo, vistos | Lista de ejercicios sin progreso |
| Banco | Piezas fijas y piezas permitidas | Escena cableada, editable sin límite |
| Ayuda | Pistas que señalan piezas | Enunciado en Markdown |

## Conclusión

Sí, sirve como referencia, y encaja bien con lo que ya existe. Las mecánicas
se pueden adoptar (niveles, objetivos en vivo con barra de permanencia,
ficha, banco restringido, pistas y méritos). No se copian sus textos,
imágenes ni marca: CRUMB es un producto comercial.

Lo propio del Sim se mantiene: la calificación 0-20 sigue como evaluación
formal y el modo en vivo se agrega como práctica. Los dos leen la misma
rúbrica.

## Propuesta por etapas

### 1. Panel de objetivos en vivo

En la pestaña **Ejercicio**, un panel con cada objetivo del reto que
muestra:

- la lectura actual (por ejemplo, «KM1: cerrado» o «nivel: 62 %»);
- la condición («cerrado durante 3 s» o «entre 60 y 80 %»);
- una barra que se llena mientras la condición se cumple, en tiempo
  simulado;
- estado pendiente, en curso o cumplido.

El alumno opera la escena a mano (pulsadores, selectores) y ve avanzar los
objetivos. Si recablea o recompila, los objetivos se reinician.

Rúbrica: se agrega una sección opcional `goals` (schema
`jwsim-rubric-2`). Cada objetivo tiene una señal, una condición
(igual, rango, verdadero/falso) y un tiempo de permanencia (`hold_ms`), y
puede depender de otro objetivo («después de que arranque KM1, …»). Los
`cases` actuales no cambian: **Calificar** sigue igual.

Motor: la escena ya expone el estado de cada equipo (`KM1.closed`,
`Y1.open`, `H1.lit`, niveles). El panel lo lee en cada paso, sin otro
simulador.

### 2. Ficha del reto y centro de aprendizaje

- **Ficha:** objetivo, pasos y qué se puede usar, sacados del enunciado,
  con botón **Empezar** y **Ver ficha** para volver a abrirla.
- **Centro de aprendizaje** (en la pantalla Proyectos): los ejercicios por
  nivel, con «a continuación», vistos y candados. El progreso se guarda en
  el perfil del usuario. El docente puede desactivar los candados.
- **Al terminar:** «qué enseña» (la columna que ya tiene `EJERCICIOS.md`) y
  el paso al siguiente reto.

### 3. Banco restringido y pistas

- En modo ejercicio, los equipos de la escena quedan bloqueados (se pueden
  ver, pero no mover ni borrar). La paleta muestra solo lo permitido, con
  cuántos quedan. Un intento no permitido se explica con una nota junto al
  puntero.
- Pistas que señalan un equipo o un borne de la escena, con **Entendido** y
  **Saltar**. Se reutiliza el resaltado de bornes que ya tiene el esquema
  eléctrico.

### 4. Mérito y distinción

Objetivos extra (por ejemplo, «sin rebote en el contactor» o «menos de N
escalones») que no cambian la nota base. Solo cuentan en una corrida sin
cambios a mitad de camino.

## Referencias visuales (capturas de CRUMB)

CRUMB trabaja a nivel de protoboard; el Sim, a nivel de tablero industrial.
De su interfaz conviene tomar la forma, no el contenido:

- **Barra de piezas por categoría, con miniaturas en 3D** (Estructura,
  Pasivos, Activos, Salidas, Entradas, Embebidos, Notas). En el Sim serían
  Mando, Protección, Potencia, Sensores, Actuadores, Instrumentos, Planta y
  Comunicación, con miniaturas de los equipos reales.
- **Ventana de osciloscopio acoplada** (*Scope View*) con trazas por
  señal, el valor actual y casillas para mostrar u ocultar. En el Sim:
  E/S del PLC, nivel, presión y corriente, con trazas digitales tipo
  escalón.
- **Capas de vista** activables (*Standard*, *Voltage*, *Current*, *Logic*):
  en el Sim, colorear los cables con tensión o los bornes en 1.
- **Cables agrupados por color en mazos y etiquetas** sobre el banco: ya hay
  cables multipolares y referencias en el esquema; faltan en 3D.
- **Barra inferior de estado de la simulación** (frecuencia y paso).

## Relación con la integración IEC

Las metas se definen sobre los equipos de la escena, no sobre el lenguaje.
Por eso los mismos retos sirven para Arduino y para proyectos OpenPLC
(Ladder, ST…), que es la etapa 3 de `PROPUESTA_PROYECTOS_IEC.md`.

## Decisiones para JW Control

1. ¿Los niveles se bloquean por defecto o quedan libres, con candado solo
   si el docente lo activa?
2. ¿El progreso es solo local o se exporta, para que el docente lo
   recoja?
3. ¿Por dónde empezamos? La etapa 1 sola ya da el efecto que más se nota.
