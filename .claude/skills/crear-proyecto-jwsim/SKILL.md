---
name: crear-proyecto-jwsim
description: Crear o modificar un proyecto completo de JWPLC Sim (.jwsim, código Arduino .ino u OpenPLC, esquema eléctrico 2D y Planta 3D) a partir de JSON corto usando jwsim-cli scene. Usar cuando pidan armar un circuito, tablero eléctrico, secuencia neumática, automatización de planta o ejercicio en JWPLC Sim.
---

# Crear o editar un proyecto `.jwsim` por JSON

Toda la documentación, plantillas de código `.ino`, reglas de diseño 2D/3D y pruebas `.jwtest.json` están concentradas en la carpeta **`docs/agentes/`**:

1. Lee primero **`docs/agentes/README.md`** y **`docs/agentes/GUIA_ESCENAS_Y_CODIGO.md`**.
2. Consulta dispositivos con `node cli/jwsim-cli.mjs scene describe [<tipo>] --json` o en **`docs/agentes/REFERENCIA_DISPOSITIVOS.md`**.
3. En neumática, usa `"sensors": "compacto"` dentro de cada `solenoid-valve` / `solenoid-valve-2` para que los finales de carrera `A0/A1`, `B0/B1`, `C0/C1` se creen y posicionen automáticamente encima del émbolo, con todos los cilindros alineados en una sola fila y el compresor `CP1` debajo.
4. Genera y valida con `node cli/jwsim-cli.mjs scene build <borrador.json> --out <dir> --create-ino --strict --json`.
5. Previsualiza 2D y 3D con `node cli/jwsim-cli.mjs scene preview <proyecto.jwsim> --out <dir> --view both --json` y verifica el comportamiento con `node cli/jwsim-cli.mjs test <prueba.jwtest.json> --json`.
