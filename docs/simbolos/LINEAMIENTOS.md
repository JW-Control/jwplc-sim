# Lineamientos para dibujar símbolos de JWPLC Sim

Estos lineamientos salen del rediseño de octubre de 2026 (pulsadores, pilotos, zumbador, selectores, contactor y fuentes). Hay que cumplirlos al crear o rehacer cualquier dispositivo de la escena, además del contrato técnico (`CONTRATO.md` del kit: viewBox, `.jw-term`, `data-*`).

Para ver la diferencia de un vistazo, compara `vistas/00-antes-simbolos-originales.png` con las demás vistas.

---

## 1. Qué estaba mal en los símbolos originales

Si un dibujo nuevo cae en alguno de estos errores, hay que rehacerlo.

1. **Una sola plantilla para todo.** Todos eran rectángulos grises con una franja oscura y tornillos iguales, y el dispositivo se reconocía solo por el texto. Sin rótulos, el pulsador, la lámpara y el selector eran el mismo dibujo.
2. **Escala aplanada.** Todos medían entre 60 y 160 px y eran casi cuadrados. Los equipos reales de tablero son altos y angostos, y la proporción con la placa no se respetaba.
3. **Bornes de tornillo en todos**, aunque el equipo real tenga otra cosa (cable, conector, bornera verde o tornillos ocultos detrás).
4. **El estado se mostraba con interfaz** (badge "ON/OFF", barras verdes, cuadrito "□") y no con la mecánica del equipo.
5. **Textos superpuestos o ilegibles** (rótulos de bornes encima de otros textos, "0 %" gris sobre negro) y parámetros que no se dibujaban.
6. **Estados idénticos:** en las fuentes, "reposo" y "activo" se veían igual.

---

## 2. Principios

### 2.1 Basarse en un modelo comercial real
- Antes de dibujar, elige **un modelo concreto que se venda en Perú** y consigue **fotos de frente** (catálogo, tienda o foto propia) y su **ficha técnica**. Marcas de referencia: CHINT, Schneider (TeSys, Harmony XB2/XB5), Mean Well, Delta.
- Si no hay foto o medida, no se inventa: se pide una foto o se mide el equipo real.
- Copia lo que identifica al equipo: silueta, material, color, ubicación de cada pieza, orden de los bornes, textos impresos (modelo, entrada/salida, "MADE IN CHINA", notas de torque) e indicadores (LED, perilla ADJ, indicador I/O).

### 2.2 Vista frontal, como se ve montado
- Siempre **vista frontal**: lo que ve el técnico frente al tablero o al riel. Ni vista lateral ni 3/4.
- Si el equipo tiene **frente y espalda distintos** (por ejemplo, la cabeza del pulsador al frente y el bloque de contactos atrás), el frente manda y la espalda **asoma** por detrás para mostrar sus bornes (ver 2.4).
- Se permite girar el equipo 90° si en la realidad puede montarse así. El pulsador se dibujó girado para que los extremos del bloque queden arriba y abajo.

### 2.3 Escala y grilla
- **4 px = 1 mm** (20 px de grilla = 5 mm). Referencia: la placa JWPLC Basic mide unos 123 mm = 484 px.
- Se usan las medidas de la ficha y se redondean a la grilla. **Si hay conflicto, gana la alineación de los bornes con la grilla**, para que los cables queden rectos, aunque la medida se aparte 1–2 mm.
- Hay **dos escalas**: los equipos de tablero van a 1:1 con la placa, y los de campo (cilindros, motores) a una escala reducida fija, siempre la misma, sin perder proporciones: **2 px = 1 mm** (aprobada el 26/10/2026 con la electroválvula y el cilindro Airtac; a 4 px/mm un cilindro de 100 mm de carrera mediría el doble que la placa). Los sensores de campo chicos (inductivo, fin de carrera) quedaron a 4 px/mm.
- El cuerpo puede no llenar el viewBox. Por ejemplo, el contactor tiene un cuerpo de 180 px dentro de un viewBox de 200 para que A1 y A2 caigan en x=20 y x=180.

### 2.4 Bornes
- `cx` siempre múltiplo de 20, en la **posición real** del equipo, con el **orden real** (por ejemplo, NDR: ⏚ N L abajo y −V −V +V +V arriba).
- Hay que distinguir **bornes** de **tornillos de fijación**. Los tornillos laterales de la base del XB2 sujetan el pulsador al tablero y no son contactos.
- El borne se dibuja como es en el equipo: tornillo Phillips con arandela (contactor, bloques XB2), tornillo ranurado en bornera verde (NDR) o tornillo dentro de un agujero de la carcasa (HDR/MDR). En cada borne se dibuja la **boca** en el borde por donde entra el cable.
- El paso puede bajar a 20 px (5 mm), igual que la placa, si el real es algo mayor (5 a 7,6 mm).
- **Licencia permitida:** si el borne real queda oculto detrás del frente, se desplaza unos milímetros para que asome (bloque de contactos del pulsador o del piloto).
- Numeración IEC de la definición: 13-14 NO, 11-12/21-22 NC, el primer dígito es la posición del bloque, A1/A2 bobina, X1/X2 piloto, L/N/PE entrada AC, ±V salida DC.

### 2.5 Estados: interpretables, no solo diferenciables
La prueba: quien mira el símbolo tiene que poder decir **"sí, está energizado"** (o pulsado, encendido, quemado) **sin conocer el simulador**.

- **Primero, el mecanismo real del equipo:**
  - Pulsador: la cabeza se hunde en el aro (más chica, más oscura y con sombra interior).
  - Contactor: el **indicador mecánico I/O** del fabricante. En reposo el portacontactos sobresale y muestra "O" verde con OFF. Energizado se hunde: se ve **más oscuro y más chico, porque por perspectiva se aleja**, y muestra "I" roja con ON.
  - Selector: gira la manija (`data-rotate`).
  - Piloto: el lente se enciende con centro casi blanco y halo del color. Apagado, el color se ve oscuro y se distingue el LED.
  - Fuente: LED DC OK verde con brillo.
- **Se respetan las convenciones del fabricante**, aunque choquen con las del tablero: en indicadores de equipo, "I" rojo = cerrado/energizado y "O" verde = abierto/seguro. Lo que dice ON/OFF debajo ayuda a leerlo.
- **Daño:** tiene que afectar a **todo el cuerpo**, no solo a una etiqueta. Contactor: hollín desde la bobina, carcasas amarillentas por calor y plástico derretido. Piloto: lente ahumado y rajado.
- Solo cuando el mecanismo real no se lee, se agrega un aviso explícito, como la "SOBRECARGA" de las fuentes, cuyo LED real solo se apaga.
- Probar siempre los estados extremos con todos los valores de cada parámetro, por ejemplo todos los colores de `param.color`.

### 2.6 Materiales y color
- Cada material, con su aspecto: cromo con gradiente y reflejo, zamak gris oscuro, plástico negro mate, etiqueta impresa azul (NDR), frente gris claro con laterales turquesa (MDR).
- Las proporciones salen de la foto. El aro del XB2 es un **filo cromado delgado** y la cabeza ocupa casi todo el aro.
- Se usan gradientes con prefijo de `id` propio del tipo (`pbno-chr`, `contactor-soot`…).

### 2.7 Textos y marcas
- Se reproducen los textos reales del frente (modelo, entrada/salida, notas) con letra sans-serif de 7 a 21 px. **Ningún texto puede quedar encima de otro ni tapado por rejillas u otros dibujos.**
- **Logos de marca:** solo los archivos oficiales entregados por JW Control, incrustados como `<image href="data:image/png;base64,…">` dentro de `<g id="<tipo>-logo">`. **No se redibujan a mano.** Si no hay archivo oficial, se deja el hueco con el mismo `id`.
- Las marcas de certificación (UL, TÜV…) van como recuadros genéricos, salvo que se tenga el archivo oficial.

---

## 3. Proceso de trabajo (el que funcionó)

1. **Referencias:** fotos de frente del modelo y su ficha, con medidas, bornes y variantes.
2. **Un solo caso primero** (por ejemplo, solo el pulsador NA). Se itera hasta aprobarlo y recién entonces se generan las variantes.
3. **Render de verificación** con el intérprete de `herramientas/preview_gen.py`:
   - todos los estados (reposo, activo, dañado) y todos los valores de cada parámetro;
   - el símbolo **a escala junto a la placa** (`referencias/jwplc-basic-render.png` del kit) sobre la grilla de 20 px.
4. **Comparar lado a lado con la foto real** y anotar las diferencias de silueta, proporción, material, posición de bornes y textos.
5. Corregir, volver a renderizar y validar con JW Control.
6. **Variantes:** las piezas comunes (aro, base, bloques, borneras) se reutilizan desde `herramientas/fam22.py` para que toda la familia sea coherente.

### Lista de control antes de entregar
- [ ] Modelo real identificado, con foto y ficha.
- [ ] Vista frontal; silueta y proporciones como en la foto.
- [ ] Escala de 4 px/mm, revisada junto a la placa.
- [ ] Bornes: `cx` múltiplo de 20, posición y orden reales, nombres de la definición, boca en el borde.
- [ ] Tornillos de fijación distintos de los bornes.
- [ ] Estados interpretables por alguien que no conoce el simulador; el daño afecta al cuerpo.
- [ ] Convenciones del fabricante respetadas.
- [ ] Sin textos superpuestos ni tapados; parámetros visibles donde corresponde.
- [ ] `id` con prefijo del tipo; sin `<script>`, `<foreignObject>` ni `on…`.
- [ ] Logo: solo archivo oficial incrustado, o hueco con su `id`.

---

## 4. Familias ya resueltas (para reutilizar)

| Familia | Modelo de referencia | Tamaño | Piezas comunes |
|---|---|---|---|
| Mando 22 mm metálico | Schneider XB2 / CHINT NP2-BA | 160×240 | aro cromado Ø~35 mm, base de zamak 36×48 mm con muescas, agujeros y tornillos de fijación, bloques negros traseros |
| Monobloque 22 mm | AD16-22DS / AD16-22SM | 120×200 (zumbador 160 por las ondas) | frente Ø29 mm, cuerpo roscado con dos placas de borne |
| Contactor | Schneider LC1D09 / CHINT CJX2-0910 | 200×320 (cuerpo 45×76 mm) | carcasas blancas, cuerpo oscuro, indicador I/O, portaetiqueta con `param.coil` |
| Fuente metálica | Mean Well NDR | 160×500 (NDR-120) | frente azul impreso, borneras verdes |
| Fuente plástica escalonada | Mean Well HDR | 220×360 (HDR-60) | negro con ranuras, tornillos en agujeros |
| Fuente ultra delgada | Mean Well MDR | 180×360 (MDR-60) | frente gris claro, laterales turquesa, relé DC OK |
