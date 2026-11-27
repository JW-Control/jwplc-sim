# Carpeta para Agentes de IA — Creación de Proyectos en JWPLC Sim

Si el usuario te pidió crear o modificar un proyecto para **JWPLC Sim**, **esta carpeta contiene todo lo que necesitas**. No necesitas inspeccionar el código fuente de la aplicación (`app/`, `scene/`, `sim/`).

## Archivos de esta carpeta

1. **`README.md` (este archivo):** flujo obligatorio de 5 pasos y comandos CLI.
2. **[`GUIA_ESCENAS_Y_CODIGO.md`](GUIA_ESCENAS_Y_CODIGO.md):** reglas estrictas de diseño del esquema 2D/3D, atajo neumático `"sensors": "compacto"`, API Arduino C++ del `JWPLC Basic` (`I0_0..I0_7`, `Q0_0..Q0_7`), patrón anti-parpadeo de máquina de estados y plantilla `.jwtest.json` para co-simular PLC + escena.
3. **[`REFERENCIA_DISPOSITIVOS.md`](REFERENCIA_DISPOSITIVOS.md):** catálogo completo autogenerado de los 65 dispositivos integrados (prefijos, tamaños, bornes, variantes SVG y salidas).

---

## Flujo obligatorio de 5 pasos

### Paso 1 — Consultar dispositivos y bornes
- Para ver un equipo en detalle (parámetros, variantes, bornes activos y salidas):
  ```powershell
  node cli/jwsim-cli.mjs scene describe <tipo> --json
  ```
  *(Nota: no existe un tipo `"cylinder"` suelto; los cilindros neumáticos vienen integrados en `solenoid-valve` [5/2 monoestable] y `solenoid-valve-2` [5/2 biestable]).*

### Paso 2 — Redactar el borrador JSON corto + programa `.ino`
Sigue las reglas de [`GUIA_ESCENAS_Y_CODIGO.md`](GUIA_ESCENAS_Y_CODIGO.md):
- **No calcules coordenadas `x, y` a mano:** omítelas para que el auto-layout aplique las reglas oficiales del simulador:
  - **Riel DIN superior (`y = 0`):** Fuentes (`PS1`) a la izquierda → `plc` al lado → contactores/relés a la derecha en la misma línea horizontal.
  - **Mando (`S1`, `S2`, pilotos):** abajo a la izquierda, debajo de las fuentes y del PLC.
  - **Cilindros neumáticos (`Y1, Y2, Y3...`):** alineados en **una sola fila horizontal**, con sus finales de carrera (`A0/A1`, `B0/B1`, `C0/C1`) colocados **automáticamente encima del émbolo** usando `"sensors": "compacto"` en cada electroválvula (no hace falta declararlos por separado).
  - **Compresor (`CP1`):** ubicado automáticamente una fila debajo de los cilindros. Si usas `"supply": "propia"`, **no** agregues una fuente `power-230vac` sin cablear.
- **Nombres de cilindros:** deja que las electroválvulas se llamen `Y1, Y2, Y3` y sus finales de carrera `A0/A1, B0/B1, C0/C1`. Tanto el **Diagrama de Estados** como la **Planta 3D** leen automáticamente las marcas `A0/A1`, `B0/B1`, `C0/C1` para rotular los cilindros como **Cilindro A, Cilindro B, Cilindro C**.

### Paso 3 — Generar y validar hasta `0` errores y `0` avisos
```powershell
node cli/jwsim-cli.mjs scene build <borrador.json> --out <carpeta_destino> --create-ino --strict --json
```
- El CLI soporta archivos JSON con o sin BOM UTF-8 de PowerShell.
- `--create-ino` solo crea el `.ino` si aún no existe (nunca sobrescribe código existente).
- Si editas el `.jwsim`, vuelve a validar con:
  ```powershell
  node cli/jwsim-cli.mjs scene validate <archivo.jwsim> --strict --json
  ```

### Paso 4 — Previsualizar Esquema 2D y Planta 3D
```powershell
node cli/jwsim-cli.mjs scene preview <archivo.jwsim> --out <carpeta_preview> --view both --json
```
- Revisa **ambas** imágenes generadas (`schematic-2d.png` y `plant-3d.png`) para confirmar que el esquema 2D y la Planta 3D estén limpios y ordenados.

### Paso 5 — Compilar y verificar la secuencia en co-simulación (`.jwtest.json`)
- **Importante:** `jwsim-cli run` solo ejecuta el binario C++ sin la escena `.jwsim` (y la primera compilación con G++ tarda ~8–12 s).
- Para probar el programa `.ino` **conectado a los cilindros, motores y finales de carrera de la escena**, crea un archivo `<nombre>.jwtest.json` (ver plantilla en [`GUIA_ESCENAS_Y_CODIGO.md`](GUIA_ESCENAS_Y_CODIGO.md) §5) y ejecuta:
  ```powershell
  node cli/jwsim-cli.mjs test <prueba.jwtest.json> --json
  ```
- No entregues el proyecto sin haber verificado que `jwsim-cli test` pasa con `ok: true`.
