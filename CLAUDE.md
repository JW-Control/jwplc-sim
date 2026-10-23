# CLAUDE.md — jwplc-sim

Contexto para agentes. La documentación está en `docs/` (ARCHITECTURE,
GATES, CLI, SDK, informes); aquí van solo las reglas de trabajo.

- Idioma: español en todo (respuestas, documentación, comentarios y
  commits). Los nombres de API y las salidas de herramientas se citan tal cual.
- Commits como `JW-Control <jw.control.peru@gmail.com>`, nunca como coautor;
  sin `Co-Authored-By`.
- El package se compila desde el código fuente fijado en `package.lock`:
  sin copias ni parches de platform-jwplc en este repositorio.
- **Comandos para Windows (PowerShell):** no indicar `npm …` ni `npx …` a
  secas. En la PC de JW Control `PATHEXT` puede tener una entrada vacía y
  PowerShell abre la ventana "¿con qué programa?" en lugar de correr npm.
  Usar siempre comandos con `node` (`node scripts/app.mjs`,
  `node cli/jwsim-cli.mjs …`, `node scripts/…`) o, si hace falta npm,
  `npm.cmd`/`npx.cmd` explícitos. Lo mismo para cualquier herramienta de
  Node instalada globalmente (`tsc` → `tsc.cmd`).
