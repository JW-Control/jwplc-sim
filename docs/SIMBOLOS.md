# Símbolos de los dispositivos de la escena (contrato .svg)

Los dispositivos de la escena se dibujan con un archivo `.svg` por tipo. Si
falta el archivo, se usa el dibujo en código de
`app/renderer/scene-symbols.js`. Cualquiera puede rehacer un símbolo sin
tocar código, siempre que respete este contrato. El simulador lo carga desde:

- `app/renderer/assets/devices/<nombre>.svg` para la biblioteca incluida
  (`jwsim/<nombre>`, p. ej. `contactor.svg`);
- `app/renderer/assets/devices/<autor>__<nombre>.svg` para otro autor;
- `symbol.svg` en la carpeta de un dispositivo del SDK instalado del índice.

Un archivo que no cumple el contrato se ignora y deja un aviso en la consola
de la app.

## 1. Tamaño y grilla

- `viewBox="0 0 ANCHO ALTO"`, con ANCHO y ALTO múltiplos de **20**.
- La escena tiene una grilla de 20 px: el símbolo se dibuja a escala 1, en
  píxeles de la escena, con su esquina superior izquierda sobre la grilla.
- Estilo de referencia: equipos de tablero vistos de frente (EduVolt,
  catálogos Schneider/Siemens). Cuerpo claro o el color real del equipo,
  contorno oscuro de 1,5 a 2 px, tornillos Phillips en las borneras y
  rótulos de bornes legibles (8 a 9 px).

## 2. Bornes

Cada borne se marca con un círculo de clase `jw-term`:

```xml
<circle class="jw-term" data-term="13" cx="40" cy="14" r="9"/>
```

- `data-term`: el nombre del borne de la definición del dispositivo (ver
  `dispositivos.json` del kit): `13`, `A1`, `L+`, `BN`…
- `cx`: **múltiplo de 20**. Es la posición del cable en la grilla.
- `cy`: centro del tornillo. El simulador oculta el círculo `.jw-term` y lo
  usa como zona de clic: debajo hay que dibujar el tornillo propiamente.
- Lado: con `cy` en la mitad superior, el cable entra por el borde de arriba
  (`y = 0`); en la inferior, por el de abajo (`y = ALTO`). `data-side="t"`
  o `data-side="b"` lo fija a mano.
- El cable llega al borde del símbolo, a la altura de `cx`. Ahí conviene
  dibujar la ranura o la boca de la bornera: el simulador pone encima el
  casquillo del terminal.

## 3. Partes que dependen del estado

Las expresiones leen el estado del dispositivo:

| Expresión | Valor |
|---|---|
| `out.<salida>` | Salida del dispositivo: `out.closed`, `out.lit`, `out.pressed`, `out.position`, `out.speed`… |
| `param.<parámetro>` | Parámetro: `param.color`, `param.coil`, `param.label`… |
| `contact.<contacto>` | Contacto cerrado: `contact.13-14` |
| `damaged`, `tripped` | Carga quemada; fuente disparada |
| `!expr`, `expr=valor` | Negación y comparación: `!out.closed`, `param.output=npn` |

| Atributo | Efecto |
|---|---|
| `data-show="expr"` | El elemento se ve solo si la expresión es verdadera. |
| `data-fill="expr"` | Pone `fill` al valor. Los nombres de color de los parámetros (`verde`, `rojo`, `amarillo`, `azul`, `blanco`, `negro`) se traducen a la paleta de lentes. |
| `data-text="expr"` o `"expr:%"` | Reemplaza el texto; con `:%`, un valor de 0 a 1 se muestra como porcentaje. |
| `data-translate="expr:v0:v1:x\|y:dist"` | Desplaza el elemento de 0 a `dist` px mientras el valor va de `v0` a `v1`. Ejemplo: `out.position:0:1:x:60` para el vástago del cilindro. |
| `data-rotate="expr:v0:v1:a0:a1:cx:cy"` | Gira de `a0` a `a1` grados alrededor de (`cx`, `cy`). Ejemplo: `out.position:-1:1:-45:45:40:50` para la perilla de un selector. |
| `data-action="id" data-kind="momentary\|toggle\|cycle"` | Zona de clic que acciona el dispositivo con la simulación en marcha. `momentary`: activo mientras se mantiene pulsado (pulsador). `toggle`: alterna. `cycle`: recorre `data-options="0,1"`. Las acciones de cada tipo están en `dispositivos.json`. |

Varios atributos pueden ir en el mismo elemento.

## 4. Lo que no se admite

Por seguridad, al cargar se quitan `<script>`, `<foreignObject>`, los
atributos `on…` y los enlaces `javascript:`. Los `id` deben ser propios del
símbolo (un prefijo con el tipo evita choques, porque varios símbolos
conviven en el mismo documento). Fuentes: las del sistema (`sans-serif`);
para un texto con una tipografía especial, mejor convertirlo a trazos.

## 5. Ejemplo mínimo (pulsador NA)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">
  <rect x="1" y="1" width="78" height="118" rx="5" fill="#e4e7eb" stroke="#1b1e22" stroke-width="1.6"/>
  <!-- borne 13 arriba, 14 abajo (cx múltiplo de 20) -->
  <circle cx="40" cy="14" r="8" fill="#f4f5f7" stroke="#1b1e22"/>
  <circle class="jw-term" data-term="13" cx="40" cy="14" r="9"/>
  <circle cx="40" cy="106" r="8" fill="#f4f5f7" stroke="#1b1e22"/>
  <circle class="jw-term" data-term="14" cx="40" cy="106" r="9"/>
  <!-- cabeza del pulsador: color del parámetro, hundida al pulsar -->
  <g data-action="press" data-kind="momentary">
    <circle cx="40" cy="60" r="18" fill="#2b2f35"/>
    <circle data-show="!out.pressed" data-fill="param.color" cx="40" cy="60" r="14"/>
    <circle data-show="out.pressed" data-fill="param.color" cx="40" cy="61" r="12" opacity="0.8"/>
  </g>
</svg>
```

El kit de símbolos (`node scripts/export-symbols.mjs`) trae, por cada tipo,
el tamaño actual, sus bornes, parámetros, acciones y salidas, y los dibujos
actuales en reposo y activos como punto de partida.
