# Propuesta: proyectos Arduino e IEC desde JWPLC Sim, con un solo OpenPLC

Propuesta del 14/11/2026, por aprobar.

## Objetivo

Que JWPLC Sim abra como el OpenPLC Editor (**Proyectos → Nuevo proyecto**,
en tres pasos) y permita crear proyectos **Arduino** o **OpenPLC (IEC
61131-3: Ladder, ST, FBD, IL, SFC)**. Sin una segunda implementación de los
lenguajes IEC: **el OpenPLC Editor (JWPLC Edition) es el único que edita y
compila IEC**; JWPLC Sim crea, abre y simula.

## Lo que ya existe

| Pieza | Dónde |
|---|---|
| El Sim abre un proyecto OpenPLC (`project.json`), muestra sus POU (solo lectura) y compila con la cadena del editor fijada en `editor.lock` | `cli/lib/openplc.mjs`, G6 |
| Al guardar en el editor, el Sim recarga y recompila solo | vigilante de archivos (G6 RELOAD_FROM_EDITOR) |
| Botón **Simular** del editor → abre el Sim con `--jwsim-open=<carpeta>` | rama `v2.1.0-alpha.18/JWPLC-Sim/feature/boton-simular` del editor |
| El editor crea proyectos por línea de comandos con **los mismos archivos que su asistente**: `"OpenPLC Editor.exe" --cli create <nombre> --path <carpeta> --language ld\|st\|fbd\|il\|sfc` | `openplc-editor/src/cli/commands/create.ts` |

Falta el camino inverso: **el editor no abre un proyecto que le pasa otro
programa** (al abrirlo de nuevo solo enfoca la ventana).

## Flujo propuesto

**Inicio de JWPLC Sim:** pantalla **Proyectos** como la del OpenPLC
(Nuevo proyecto, Abrir, Recientes, Ejemplos, Ejercicios).

**Nuevo proyecto, en tres pasos:**

1. **Tipo:** Arduino (C++) u OpenPLC (IEC 61131-3).
2. **Nombre y carpeta** (en OpenPLC, también el intervalo de la tarea, por
   defecto `T#20ms`, como el editor).
3. **Lenguaje** (solo OpenPLC): Ladder, Structured Text, FBD, IL o SFC.

**Qué pasa al terminar:**

- **Arduino:** como hoy, un sketch nuevo en el editor del Sim.
- **OpenPLC:** el Sim llama a la CLI del editor (`--cli create`), así el
  proyecto es idéntico al que crearía el editor. Luego lo abre para simular
  (ya funciona) y **lanza el OpenPLC Editor con ese proyecto** para
  programarlo. Al guardar en el editor, el Sim recompila solo; el botón
  Simular del editor vuelve al Sim.

En los proyectos IEC, el Sim muestra **Abrir en OpenPLC Editor** donde hoy
dice «se edita en el OpenPLC Editor».

## Etapas

1. **En el Sim:** pantalla Proyectos y asistente de 3 pasos; el tipo
   OpenPLC crea con la CLI del editor. Ubicar el editor instalado
   (detección automática y ruta configurable) y avisar si falta o si su
   versión no coincide con `editor.lock`.
2. **En el editor (JWPLC Edition):** abrir un proyecto pasado como
   argumento (`--open-project=<carpeta>`), también si el editor ya está
   abierto (evento `second-instance`). Es el espejo de `--jwsim-open`.
   Cambio chico, pero en el repo del editor: necesita autorización de
   JW Control.
3. **Ida y vuelta:** botón «Abrir en OpenPLC Editor» en el Sim, recientes de
   los dos tipos, ejercicios IEC con la misma rúbrica (califica salidas y
   equipos de la escena, no el lenguaje).
4. **Más adelante** (ya en la hoja de ruta, «fase 4»): vista Ladder **de
   solo lectura** con depuración en vivo dentro del Sim, leyendo los datos
   del editor. Sigue habiendo un solo editor IEC.

## Por qué así

- Un solo lugar para Ladder/ST/FBD/IL/SFC: lo que mejore el editor (o el
  OpenPLC de upstream) llega al Sim sin duplicar trabajo.
- Los proyectos son los mismos archivos: se abren en el editor, en el Sim o
  en el JWPLC real sin conversiones.
- El Sim no compite con el editor: lo complementa con la planta, el tablero
  eléctrico, las fallas y la calificación.

## A verificar antes de empezar

- Que la CLI `--cli create` esté en la versión del editor que se instala
  (está en la rama alpha.18; confirmar en la versión publicada).
- Las dos aplicaciones abiertas a la vez: memoria del equipo de los alumnos.
- El orden de instalación (instalador del Sim que detecte o instale el
  editor).
