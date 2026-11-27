# Editor Ladder del Sim

En un proyecto OpenPLC, la pestaña de un `.ld` muestra el Ladder con el aspecto
del OpenPLC Editor. Con **✎ Editar** se modifica ahí mismo. El archivo es el
mismo que abre el OpenPLC Editor: se puede pasar de uno a otro.

## Qué se puede hacer

- **Colocar elementos.** Se elige un elemento en la barra y luego un rombo ◆
  del peldaño. Los rombos de abajo abren una rama en paralelo. Los elementos
  disponibles son:
  - contactos NA, NC, P y N (teclas 1 a 4);
  - bobinas normal, negada, Set y Reset (teclas 5 a 8);
  - bloques TON, TOF, CTU, MOVE, EQ… de las bibliotecas IEC (tecla 9).
- **Variables.** Con doble clic, ⚙ o Enter se edita el elemento seleccionado:
  la variable y su tipo (NA, NC, flanco…).
  - Un nombre que no existe se declara en `VAR … END_VAR`. Puede ir en una
    entrada o salida libre de la placa (`%IX0.n` / `%QX0.n`) o como variable
    interna.
  - Un bloque de función pide su instancia (por ejemplo `TON0 : TON;`).
  - Los pines de un bloque (PT, PV…) se editan con un clic. Aceptan una
    variable o un valor fijo (`T#2s`).
- **Backplane** (botón ⊞ Backplane): es la misma pantalla del OpenPLC Editor.
  - Muestra las borneras del JWPLC Basic (I0.0–I0.7, Q0.0–Q0.7), cada una con
    su dirección IEC fija y un **alias**.
  - Se guarda en `devices/configuration.json`, en
    `vendorScreenData["io-mapping"]`, con la misma forma que el editor.
  - Una variable puede ir `AT <alias>` y la cadena lo resuelve a la dirección
    al compilar.
  - Al colocar un contacto o una bobina, la lista ofrece también los alias.
  - Cambiar un alias actualiza las variables que lo usaban.
- **Tabla de variables**: es la pestaña «Variables» del panel de abajo.
  - Tiene las columnas de la tabla del OpenPLC Editor: Nombre, Clase, Tipo,
    Ubicación, Valor inicial y Documentación.
  - Edita la línea de cada variable en `VAR … END_VAR` y conserva el resto de
    la cabecera.
  - Renombrar una variable la renombra también en el Ladder.
- **Direcciones en el diagrama**: debajo de cada contacto y bobina aparece en
  chico su dirección real, resuelta por el alias si hace falta. En vivo, los
  alias también se pintan y se pueden forzar.
- **Peldaños.** Se pueden agregar, subir, bajar y borrar. Con un clic en la
  cabecera se edita el comentario.
- **Borrar.** Supr borra lo seleccionado. Ctrl+Z deshace y Ctrl+Y rehace.
- **Guardar.** La pestaña queda con cambios sin guardar. Se guarda con Guardar
  (Ctrl+S) o al pulsar Ejecutar, que compila con la misma cadena del OpenPLC
  Editor.

## Por qué es compatible

Las operaciones de peldaño no son una copia propia. Son las del OpenPLC Editor,
de su código fijado en `editor.lock`:

- dónde se puede soltar un elemento,
- agregar,
- borrar,
- abrir y cerrar ramas en paralelo,
- reacomodar las posiciones,
- crear un peldaño,
- la firma de los bloques.

`scripts/fetch-editor.mjs` empaqueta sus `ladder-utils`, sin React Flow, en
`deps/ladder-ops.cjs`, junto a `pipeline.cjs`. Lo que necesita el empaquetado
está en `scripts/ladder-ops/`: el punto de entrada y sustitutos mínimos de
React, uuid, lodash, clsx y el aviso de errores.

Las piezas son:

- `app/lib/ladder-edit.mjs` (proceso principal, IPC `ld:op`): llama a esas
  operaciones y carga los bloques de las `.stlib` de STruC++.
- `app/renderer/ladder-edit.js`: la interfaz (barra, rombos, selección,
  propiedades, cabecera VAR, deshacer).
- `app/lib/plc-diagram.cjs` (`ladderView` con `opts.edit`): el dibujo.

Para vincular variables, la interfaz sigue las mismas reglas que el editor:

- Una variable declarada se copia entera en el nodo, como hace
  `sync-nodes-with-variables`.
- Un valor fijo se guarda solo por nombre.
- El valor de un pin se guarda en el pin y en `connectedVariables` del bloque,
  como hace `variable.tsx`.

## Prueba

```powershell
cd C:\Users\jeykc\Documentos\GitHub\jwplc-sim\app
node tests/e2e-ladder-editor.mjs
```

La prueba trabaja sobre la lección IEC 03 en LD:

- agrega un contacto NC con una variable nueva en `%IX0.5`;
- arma un peldaño con un contacto, una rama en paralelo, un TON (instancia y
  PT) y una bobina;
- edita el comentario;
- borra un elemento y lo deshace;
- pone el alias SENSOR en I0.6 y agrega un contacto que lo usa;
- en la tabla, agrega una variable y renombra otra;
- guarda y compila.

Además comprueba el texto estructurado que genera la cadena del OpenPLC
Editor: `RETARDO(IN := H2 OR MARCHA, PT := T#2s);`.

Las capturas quedan en `build/gates/ladder-editor/`.
