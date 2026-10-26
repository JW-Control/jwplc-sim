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
de la app. **Cómo dibujar** (modelo comercial real, vista frontal, escala de
4 px/mm, estados interpretables, materiales y textos): ver
[`simbolos/LINEAMIENTOS.md`](simbolos/LINEAMIENTOS.md), con los generadores
de cada familia en `simbolos/herramientas/`.

## 1. Tamaño y grilla

- `viewBox="0 0 ANCHO ALTO"`, con ANCHO y ALTO múltiplos de **20**.
- La escena tiene una grilla de 20 px: el símbolo se dibuja a escala 1, en
  píxeles de la escena, con su esquina superior izquierda sobre la grilla.
- Estilo de referencia: equipos de tablero vistos de frente (EduVolt,
  catálogos Schneider/Siemens). Cuerpo claro o el color real del equipo,
  contorno oscuro de 1,5 a 2 px, tornillos Phillips en las borneras y
  rótulos de bornes legibles (8 a 9 px).

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

## 3. Partes que dependen del estado

Las expresiones leen el estado del dispositivo:

| Expresión | Valor |
|---|---|
| `out.<salida>` | Salida del dispositivo: `out.closed`, `out.lit`, `out.pressed`, `out.position`, `out.speed`… |
| `param.<parámetro>` | Parámetro: `param.color`, `param.coil`, `param.label`… |
| `contact.<contacto>` | Contacto cerrado: `contact.13-14` |
| `damaged`, `tripped` | Carga quemada; fuente disparada |
| `!expr`, `expr=valor` | Negación y comparación: `!out.closed`, `param.output=npn` |
| `expr>n`, `expr<n` | Comparación numérica: `out.serpentin>0.05`, `!out.tMasa<20` |
| `expr\|expr` | La primera que tenga valor: `out.distance\|param.distance` (la salida en marcha, el parámetro en edición) |

| Atributo | Efecto |
|---|---|
| `data-show="expr"` | El elemento se ve solo si la expresión es verdadera. |
| `data-fill="expr"` | Pone `fill` al valor. Los nombres de color de los parámetros (`verde`, `rojo`, `amarillo`, `azul`, `blanco`, `negro`) se traducen a la paleta de lentes. |
| `data-text="expr"`, `"expr:%"`, `"expr:mm"`, `"expr:dN:unidad"` o `"expr:hm"` | Reemplaza el texto; con `:%`, un valor de 0 a 1 se muestra como porcentaje; con `:mm`, como largo con un decimal (`12,5 mm`); con `:d1:°C`, con N decimales y la unidad (`27,4 °C`; sin valor, `—`); con `:hm`, horas como `8 h 05 min`. |
| `data-translate="expr:v0:v1:x\|y:dist"` | Desplaza el elemento de 0 a `dist` px mientras el valor va de `v0` a `v1`. Ejemplo: `out.position:0:1:x:60` para el vástago del cilindro. Por tramos, `expr:v0,v1,…:x\|y:p0,p1,…`: cada valor cae en su posición en px y entre dos se interpola; sirve para exagerar un tramo corto (la histéresis del sensor inductivo: `out.distance:0,8,8.8,20:x:0,170,220,320`). |
| `data-rotate="expr:v0:v1:a0:a1:cx:cy"` | Gira de `a0` a `a1` grados alrededor de (`cx`, `cy`). Ejemplo: `out.position:-1:1:-45:45:40:50` para la perilla de un selector. |
| `data-spin="expr:cx:cy:vps"` | Giro continuo con la simulación alrededor de (`cx`, `cy`): con el valor 1 da `vps` vueltas por segundo de tiempo simulado; con 0 se detiene, con un valor negativo gira al revés. El ángulo se integra con el tiempo simulado (se detiene en pausa y sigue la rampa). Ejemplo: `out.speed:60:60:2` para el ventilador de un motor. |
| `data-action="id" data-kind="momentary\|toggle\|cycle"` | Zona de clic que acciona el dispositivo con la simulación en marcha. `momentary`: activo mientras se mantiene pulsado (pulsador). `toggle`: alterna. `cycle`: recorre `data-options="0,1"`. Las acciones de cada tipo están en `dispositivos.json`. |
| `data-action="id" data-kind="drag" data-drag="x\|y:px0:px_por_unidad:min:max"` o `"x\|y:px0:v0,v1,…:p0,p1,…"` | Pieza que se arrastra sobre un eje (acción de tipo `value`). Lineal: el valor es `(posición − px0) / px_por_unidad`, limitado a `min`..`max`. Por tramos: la misma escala que su `data-translate`, desde `px0`. Se redondea a 0,1. Con la simulación en marcha manda la acción; detenida, fija el parámetro del mismo `id` (posición inicial). El elemento se mueve con su propio `data-translate`. Ejemplo: la pieza del sensor inductivo, `x:248:0,8,8.8,20:0,170,220,320`. |

Varios atributos pueden ir en el mismo elemento.

## 4. Lo que no se admite

Por seguridad, al cargar se quitan `<script>`, `<foreignObject>`, los
atributos `on…`, los enlaces `javascript:` y toda `<image>` cuyo `href` no
sea una imagen incrustada (`data:image/png`, `data:image/jpeg` o
`data:image/svg+xml`). Así van los logos oficiales de marca (lineamientos
§2.7). Los estilos de texto de la app no alcanzan a la plantilla: los
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

Símbolos v2 (aprobados por JW Control el 24/10/2026, según
`simbolos/LINEAMIENTOS.md`): pulsadores NA, NC, 2 NA y NA + NC
(familia XB2), pilotos XB2 y AD16, zumbador AD16-22SM, selectores de 2 y
3 posiciones, contactor CJX2 (1NA y 1NC) y fuentes Mean Well MDR-60,
HDR-60 y NDR-120. Las vistas de verificación están en `simbolos/vistas/`.

G8_2D_ELECTRICAL (en curso, uno a la vez con fotos y planos de JW Control;
aprobados el 25/10/2026): red de 230 VAC como termomagnético CHINT NXB-63 C16, fin de carrera
Telemecanique XCKJ10511 (cables con marcador y función NA/NC) y sensor
inductivo Autonics PR18-8D (M18, Sn 8 mm), con la pieza arrastrable y la
zona de detección (hasta Sn = 8 mm) y la de histéresis (hasta 8,8 mm). Como
en EduVolt, el área de trabajo no está a escala: un cono exagerado con una
escala por tramos para que la histéresis se vea y se pueda manipular; la
cota sobre la pieza da la distancia real.

Bloques de planta (propuesta, sin aprobar): el fermentador de café
(`fermentador.svg`, generado por `simbolos/herramientas/gen_fermentador.py`)
es un esquema de proceso, no la vista de un equipo: terma solar, válvula Y1,
bombas M1 y M2, flujostato FS1, tanque con serpentín y sondas, y abajo la
regleta con los bornes que se cablean al tablero. Los cables de las sondas
se dibujan porque son los que se llevan a los transmisores.

Propuesta del 26/10/2026, por aprobar: electroválvula Airtac 4V210-08
(5/2 monoestable, conector DIN) con cilindro Airtac MBL20x100-CA, según fotos
y catálogos de Airtac entregados por JW Control
(`simbolos/herramientas/gen_electrovalvula_4v2.py 4v210`). Primer equipo de campo
a la escala reducida de 2 px/mm (lineamientos 2.3): cilindro arriba con los
puertos al frente, válvula abajo, mangueras A al puerto trasero y B al
delantero (la que tiene presión, azul intenso), silenciadores en R y S y
alimentación por P. El conector DIN va girado 180° para que el cable baje a
A1/A2 sin cruzar las mangueras. Estados: LED del conector, vástago con
`data-translate` (100 mm = 200 px) y bobina cortada con hollín; los textos
de la bobina siguen a `param.coil`.
Escala de campo aprobada por JW Control el 26/10/2026. Variante biestable
(`jwsim/solenoid-valve-2`, mismo generador con `4v220`): Airtac 4V220-08 de
171 mm con una bobina en cada extremo, A− a la izquierda (P→B, entra) y A+ a
la derecha (P→A, sale), cada una con su conector, su LED y su cable con
marcador amarillo; bornes A-1/A-2 abajo a la izquierda y A+1/A+2 a la
derecha. Las mangueras siguen a `out.spoolA` (la corredera recuerda la
posición entre pulsos).

Motores trifásicos (propuesta del 26/10/2026, medidas aproximadas hasta
tener el catálogo de WEG): `gen_motor_frontal.py` dibuja el WEG W22 IEC 80
visto desde el ventilador, a 2 px/mm, con las aspas girando detrás de la
rejilla (`data-spin` con `out.speed`), la caja de bornes con la placa de
datos y los cables con marcador. Variantes: `motor-3ph` (U1 V1 W1 PE),
`motor-3ph__6cables` (siete bornes) y `motor-2v` (1U…2W y PE). Motor
aprobado por JW Control el 26/10/2026.

Relé térmico CHINT NR2-25 (`gen_termico_nr2.py`, 26/10/2026): medidas y
colores de la ficha CHINT serie NR2 (45 mm de ancho, 4 px/mm), pines 1/3/5
en x = 40, 80, 120 para que calcen bajo los bornes 2/4/6 del contactor
CJX2; dial azul que gira con el ajuste, lengüeta TEST, STOP rojo, RESET
azul con la ranura en A o H, banderín naranja de disparo en la ventana y
aviso de falta de fase.

Variador Delta VFD-EL (`gen_vfd_el.py`, propuesta del 26/10/2026, medidas
aproximadas del armazón A hasta tener el manual y fotos): pantalla LED con
los indicadores F/H/U, LEDs RUN STOP FWD REV, seis teclas accionables y la
perilla de frecuencia (`data-kind="drag"` vertical con `data-rotate`). Los
bornes de control, que en el equipo están bajo la tapa inferior, se
reparten arriba (R S PE, RA RB RC, SG+ SG-) y abajo (U V W, MI1-MI6, DCM,
+24V) para cablear el plano.

Pendientes (todavía dibujados en código, sin escala real): sensor
fotoeléctrico, relé enchufable y motor monofásico.
`node scripts/export-symbols.mjs` los marca con `plantilla: null` en `dispositivos.json`.
