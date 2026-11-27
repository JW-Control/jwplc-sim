# Símbolos de los dispositivos de la escena (contrato .svg)

Los dispositivos de la escena se dibujan con un archivo `.svg` por tipo. Si
falta el archivo, se usa el dibujo en código de
`app/renderer/scene-symbols.js`. Cualquiera puede rehacer un símbolo sin
tocar código, siempre que respete este contrato. El simulador lo carga desde:

- `app/renderer/assets/devices/<nombre>.svg` para la biblioteca incluida
  (`jwsim/<nombre>`, p. ej. `contactor.svg`);
- `app/renderer/assets/devices/<nombre>__<variante>.svg` para una variante
  de un tipo incluido (ver §1.1);
- `app/renderer/assets/devices/<autor>__<nombre>.svg` para otro autor (cuando
  `<autor>` no es un tipo incluido);
- `symbol.svg` (y `symbol__<variante>.svg`) en la carpeta de un dispositivo
  del SDK instalado del índice.

Un archivo que no cumple el contrato se ignora y deja un aviso en la consola
de la app. **Cómo dibujar** (proporción real, vista frontal, escala de 4 px/mm,
contorno grueso, estados interpretables, sin marcas de terceros): ver
[`simbolos/LINEAMIENTOS.md`](simbolos/LINEAMIENTOS.md), con los generadores
de cada familia en `simbolos/herramientas/`.

## 1. Tamaño y grilla

- `viewBox="0 0 ANCHO ALTO"`, con ANCHO y ALTO múltiplos de **20**.
- La escena tiene una grilla de 20 px: el símbolo se dibuja a escala 1, en
  píxeles de la escena, con su esquina superior izquierda sobre la grilla.
- Estilo: «réplica JW» (19/11/2026), ver los lineamientos. Proporción del
  equipo real, contorno oscuro de 2 a 3 px, color plano sin degradados,
  tornillos Phillips grandes y rótulos de borne en negrita (10 a 18 px).

### 1.1 Variantes por parámetro

Un tipo puede tener una plantilla por valor de un parámetro de lista: el
archivo `<nombre>__<valor>.svg`, con el valor en minúsculas y sin signos
(`MDR-60` → `mdr60`). Si no hay plantilla para ese valor se usa la del tipo
(`<nombre>.svg`). Hoy:

| Tipo | Parámetro | Plantillas |
|---|---|---|
| `power-24vdc` | `model` | `power-24vdc__mdr60.svg` (por defecto), `__hdr60`, `__ndr120` |
| `lamp` | `model` | `lamp.svg` (XB2, por defecto), `lamp__ad16.svg` |
| `contactor` | `aux` | `contactor.svg` (10: 13-14 NA, CJX2-0910), `contactor__01.svg` (01: 21-22 NC, CJX2-0901) |
| `limit-switch` | `model` | `limit-switch.svg` (XCKJ, por defecto), `limit-switch__compacto.svg` (palanca con rodillo de módulo didáctico, 120 × 200) |
| `breaker` | `poles` | `breaker.svg` (1P, por defecto), `breaker__2p.svg`, `breaker__3p.svg` |

Cada variante puede tener otro tamaño y otros bornes. Una variante que no
muestra un borne de la definición (p. ej. la HDR-60 no tiene PE) deja ese
borne sin cablear.

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
- Un equipo sin bornes eléctricos (la unidad de mantenimiento neumática) lo
  declara con `data-terms="none"` en el `<svg>`; sin eso, un archivo sin
  `.jw-term` se rechaza.

Si el tornillo que se ve no está donde entra el cable (p. ej. la bornera de
control del VFD-EL, cuyos cables entran abajo a la izquierda), se marca
además con `jw-term-alt`, con el mismo `data-term`:

```xml
<circle class="jw-term-alt" data-term="MI1" cx="436.8" cy="386" r="6"/>
```

Un clic (o soltar un cable arrastrado) en ese punto conecta el mismo borne;
el cable sigue entrando por su `jw-term`. `cx` y `cy` son libres (no van en
la grilla) y el simulador también oculta el círculo.

## 3. Partes que dependen del estado

Las expresiones leen el estado del dispositivo:

| Expresión | Valor |
|---|---|
| `out.<salida>` | Salida del dispositivo: `out.closed`, `out.lit`, `out.pressed`, `out.position`, `out.speed`… |
| `param.<parámetro>` | Parámetro: `param.color`, `param.coil`, `param.label`… |
| `contact.<contacto>` | Contacto cerrado: `contact.13-14` |
| `damaged`, `tripped` | Carga quemada; fuente disparada |
| `wired.<borne>` | El borne tiene un cable en la escena (sin cable no tiene valor, así `wired.SG+\|wired.SG-` es verdadero con cualquiera de los dos). Sirve para dibujar el cable interno de un borne solo cuando se usa. |
| `!expr`, `expr=valor` | Negación y comparación: `!out.closed`, `param.output=npn` |
| `expr>n`, `expr<n` | Comparación numérica: `out.serpentin>0.05`, `!out.tMasa<20` |
| `expr\|expr` | La primera que tenga valor: `out.distance\|param.distance` (la salida en marcha, el parámetro en edición) |

| Atributo | Efecto |
|---|---|
| `data-show="expr"` | El elemento se ve solo si la expresión es verdadera. |
| `data-fill="expr"` | Pone `fill` al valor. Los nombres de color de los parámetros (`verde`, `rojo`, `amarillo`, `azul`, `blanco`, `negro`) se traducen a la paleta de lentes. |
| `data-text="expr"`, `"expr:%"`, `"expr:mm"`, `"expr:dN:unidad"` o `"expr:hm"` | Reemplaza el texto; con `:%`, un valor de 0 a 1 se muestra como porcentaje; con `:mm`, como largo con un decimal (`12,5 mm`); con `:d1:°C`, con N decimales y la unidad (`27,4 °C`; sin valor, `—`); con `:hm`, horas como `8 h 05 min`. |
| `data-translate="expr:v0:v1:x\|y:dist"` | Desplaza el elemento de 0 a `dist` px mientras el valor va de `v0` a `v1`. Ejemplo: `out.position:0:1:x:60` para el vástago del cilindro. Por tramos, `expr:v0,v1,…:x\|y:p0,p1,…`: cada valor cae en su posición en px y entre dos se interpola; sirve para exagerar un tramo corto (la histéresis del sensor inductivo: `out.distance:0,8,8.8,20:x:0,170,220,320`). |
| `data-seg="expr:N"` | Pantalla de 7 segmentos de N dígitos: el texto (`out.lcd`) se alinea a la derecha y el punto se suma al dígito anterior («F60.0», «01.09»). Cada segmento es un elemento con `data-s="<dígito><a-g o p>"` (`0a` … `3p`; a arriba, b-c derecha, d abajo, e-f izquierda, g centro, p punto) y se pinta con `data-on` o `data-off` del grupo. Ejemplo: el variador VFD-EL. |
| `data-rotate="expr:v0:v1:a0:a1:cx:cy"` | Gira de `a0` a `a1` grados alrededor de (`cx`, `cy`). Ejemplo: `out.position:-1:1:-45:45:40:50` para la perilla de un selector. |
| `data-spin="expr:cx:cy:vps"` | Giro continuo con la simulación alrededor de (`cx`, `cy`): con el valor 1 da `vps` vueltas por segundo de tiempo simulado; con 0 se detiene, con un valor negativo gira al revés. El ángulo se integra con el tiempo simulado (se detiene en pausa y sigue la rampa). Ejemplo: `out.speed:60:60:2` para el ventilador de un motor. |
| `data-action="id" data-kind="momentary\|toggle\|cycle"` | Zona de clic que acciona el dispositivo con la simulación en marcha. `momentary`: activo mientras se mantiene pulsado (pulsador). `toggle`: alterna. `cycle`: recorre `data-options="0,1"`. Las acciones de cada tipo están en `dispositivos.json`. |
| `data-action="id" data-kind="drag" data-drag="x\|y:px0:px_por_unidad:min:max"` o `"x\|y:px0:v0,v1,…:p0,p1,…"` | Pieza que se arrastra sobre un eje (acción de tipo `value`). Lineal: el valor es `(posición − px0) / px_por_unidad`, limitado a `min`..`max`. Por tramos: la misma escala que su `data-translate`, desde `px0`. Se redondea a 0,1. Con la simulación en marcha manda la acción; detenida, fija el parámetro del mismo `id` (posición inicial). El elemento se mueve con su propio `data-translate`. Ejemplo: la pieza del sensor inductivo, `x:248:0,8,8.8,20:0,170,220,320`. |

Varios atributos pueden ir en el mismo elemento.

## 4. Lo que no se admite

Por seguridad, al cargar se quitan `<script>`, `<foreignObject>`, los
atributos `on…`, los enlaces `javascript:` y toda `<image>` cuyo `href` no
sea una imagen incrustada (`data:image/png`, `data:image/jpeg` o
`data:image/svg+xml`). La biblioteca incluida no usa logos de marca
(lineamientos §2.4). Los estilos de texto de la app no alcanzan a la plantilla: los
`fill`, `font-*` y `text-anchor` del archivo se respetan. Los `id` deben ser propios del
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

## 6. Estado de la biblioteca

Los 62 símbolos incluidos están en estilo «réplica JW» (aprobado por JW Control
el 19/11/2026) y se generan con `simbolos/herramientas/v3/`:

- `fam_mando.py`: 15 de mando y medición (22 mm y AD16);
- `fam_tablero.py`: 19 de riel DIN, redibujados uno por uno a proporción real;
- `fam_campo.py`: 21 de campo, a escala reducida fija;
- `fam_proceso.py`: 6 bloques de proceso.

`vfd-el.svg` y `fermentador.svg` se editan a mano (sin marca ni degradados).
Los generadores anteriores de `simbolos/herramientas/` quedan como historia y
ya no reflejan el estilo vigente.
