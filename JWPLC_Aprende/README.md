# JWPLC_Aprende

Todo el material de aprendizaje del **JWPLC Basic** en un solo lugar. Se edita
aquí y lo usan JWPLC Sim, la página web de JW Control y cualquier otro
repositorio que la enlace.

```text
JWPLC_Aprende/
├── library.properties         librería de Arduino (versión del material)
├── catalogo.json              resumen de todo para la web (generado)
├── examples/
│   └── Curso_JWPLC_Basic/     el curso: una lección = un ejemplo de Arduino IDE
│       ├── 1.Primeros_pasos/01.Hola_JWPLC/01.Hola_JWPLC.ino
│       └── 2.Tiempo_y_logica/…
└── extras/
    ├── retos/<id>/            retos calificables de JWPLC Sim
    │   ├── <id>.jwsim         escena, programa y nivel (exercise.level, brief)
    │   ├── ENUNCIADO.md       enunciado para el alumno
    │   ├── rubrica.json       objetivos en vivo y casos de calificación
    │   ├── sketch/            plantilla que recibe el alumno
    │   └── solucion/          solución (no se copia al alumno)
    ├── arquitecturas/<id>/    casos industriales de la vitrina
    │   ├── <id>.jwsim
    │   ├── VITRINA.md         título, descripción, recorrido y fallas
    │   └── *.jwtest.json
    └── imagenes/              reto-<id>.jpg y arq-<id>.jpg (miniaturas 3D)
```

## Cómo se edita

- **Lección del curso:** su carpeta tiene el sketch (`NN.Nombre.ino`, solo
  el código con dos renglones de cabecera) y la guía en `README.md`, que es
  lo que muestra el Sim (a la izquierda del código y en la pestaña Teoría) y
  la web. Respete sus títulos: `# Curso JWPLC Basic · Lección NN · Título` y
  las secciones `## Qué vas a aprender`, `## Qué necesitas`,
  `## Qué conectar`, `## Cómo probarlo`, `## Para practicar` (y las propias
  que hagan falta). Una unidad nueva es otra carpeta `N.Nombre_de_unidad`.
  El README.md es la **ficha** corta que el Sim muestra al abrir la lección.
- **Clase de la lección:** `GUIA.md`, junto al sketch, es la lección
  completa de la wiki de jw-control.com (repositorio JW-Page). Se edita en la
  wiki y se trae con `node scripts/importar-wiki-curso.mjs <carpeta de
  JW-Page>`. El Sim la muestra a la izquierda del código y cada trozo de
  código de la clase resalta sus líneas en el editor.
- **La clase dentro del Sim:** la wiki está escrita para el equipo físico.
  El Sim quita «Lo que necesitas» y los consejos de cable y puerto de «Si
  algo no funciona», y cambia «Súbelo y pruébalo» por la sección
  `## En JWPLC Sim` del README.md de la lección (Ejecutar, pestaña Serie,
  Mandos del panel Reto). Toda lección nueva trae esa sección.
- **Reto:** su carpeta en `extras/retos`. El nivel y la ficha van en
  `exercise` del `.jwsim`; los objetivos, en `rubrica.json`.
- **Arquitectura:** su carpeta en `extras/arquitecturas`; la primera línea de
  `VITRINA.md` es el título y las siguientes, hasta «Recorrido», la
  descripción.
- **Imágenes:** `node scripts/capturar-inicio.mjs` (desde la raíz de
  jwplc-sim) las vuelve a sacar de la Planta 3D.

Después de editar, desde la raíz de jwplc-sim:

```powershell
node scripts/gen-catalogo.mjs
node --test tests/app/aprende_test.mjs
```

y suba `library.properties` → `version` cuando publique un cambio que la web
u otros repositorios deban tomar.

## Cómo se enlaza

- **JWPLC Sim:** la lee directamente (pantalla Inicio, Ejemplos, retos y
  arquitecturas).
- **Página web:** `catalogo.json` trae títulos, fichas, rutas e imágenes. Las
  rutas son relativas a esta carpeta, así que la web arma la URL con la rama o
  el tag que quiera fijar:

  ```text
  https://raw.githubusercontent.com/JW-Control/jwplc-sim/<rama o tag>/JWPLC_Aprende/catalogo.json
  https://raw.githubusercontent.com/JW-Control/jwplc-sim/<rama o tag>/JWPLC_Aprende/<imagen o ruta>
  ```

- **Otro repositorio:** copie solo esta carpeta con un checkout disperso:

  ```powershell
  git clone --depth 1 --filter=blob:none --sparse https://github.com/JW-Control/jwplc-sim
  cd jwplc-sim
  git sparse-checkout set JWPLC_Aprende
  ```

- **Arduino IDE:** al ser una librería, su carpeta copiada en `libraries/`
  muestra el curso en Archivo › Ejemplos › JWPLC_Aprende.

Licencia: MIT (ver `REUSE.toml` de jwplc-sim), para que alumnos y docentes
copien plantillas, soluciones y rúbricas libremente.
