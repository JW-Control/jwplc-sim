# Lineamientos para dibujar símbolos de JWPLC Sim

Estilo vigente: **«réplica JW»**, aprobado por JW Control el 19/11/2026. Reemplaza los lineamientos de
octubre (copiar un modelo comercial con su marca, degradados y fotos) y el estilo v3 «tablero JW» del
mismo 19/11. Hay que cumplirlos al crear o rehacer cualquier dispositivo, además del contrato técnico
de [`../SIMBOLOS.md`](../SIMBOLOS.md) (viewBox, `.jw-term`, `data-*`).

Los 62 símbolos de la biblioteca se generan con `herramientas/v3/` (ver su `README.md`).

---

## 1. La idea

El equipo tiene que parecer **una réplica del equipo real** y no una caricatura: la silueta, las
proporciones, el orden de los bornes y las piezas que uno toca son las del equipo que se vende. El
acabado, en cambio, es **nuestro**: plano, limpio y sin marcas de terceros.

Con un vistazo, quien mira el tablero tiene que poder decir qué es cada equipo y en qué estado está,
sin conocer el simulador.

## 2. Reglas

### 2.1 Proporción real
- **4 px = 1 mm** en el tablero (20 px de grilla = 5 mm). Módulo DIN: 18 mm → 80 px por polo (se
  redondea a la grilla), 90 mm de alto → 360 px; frente de 45 mm → 180 a 200 px.
- Los equipos de campo van a escala reducida fija (motores 320 × 260, electroválvulas 440 × 220),
  nunca más grandes que el tablero.
- Gana la alineación de los bornes con la grilla: `cx` múltiplo de 20, aunque la medida se aparte 1–2 mm.

### 2.2 Silueta y contorno
- **Contorno oscuro (`#1f2328`) de 3 px** en el cuerpo del tablero y de 2 a 2,4 px en piezas y en campo.
  Es lo que hace que el equipo se lea nítido a cualquier zoom.
- Zonas en **dos o tres grises planos**: bornera más oscura (`#c4c9cf`), cuerpo (`#e1e4e8`), frente.
  Separar zonas con línea, nunca con degradado.
- **Un módulo por polo**: el termomagnético de 2 o 3 polos son 2 o 3 módulos pegados, cada uno con su
  palanca, unidos por la barra.

### 2.3 Bornes
- Tornillo Phillips **grande** (radio 13 px con paso de 40 px; 8,5 a 10 px con paso de 20 px), cabeza
  blanca, cruz oscura gruesa.
- Rótulo del borne **en negrita, 10 a 18 px, con relieve blanco** (`stroke="#fff"` +
  `paint-order="stroke"`). Se usa la numeración IEC completa donde entra: `1/L1`, `2/T1`, `13 NO`, `A1`.
- Numeración IEC de la definición: 13-14 NO, 11-12 y 21-22 NC, A1/A2 bobina, X1/X2 piloto, L/N/PE
  entrada AC, ±V salida DC.

### 2.4 Un solo dato, sin relleno
- **Franja JW** (negra, «JW» blanco y el chevron verde) como única marca, con un dato corto a la derecha
  (`9 A`, `24 V`, `guardamotor`).
- Un **dato grande** por equipo (`C16`, `60 W`, la bobina del contactor). Nada de texto de relleno
  (líneas de placa falsas, «ON ▲ OFF ▼», «MADE IN…»).
- **Sin marcas de terceros** ni logos (ni CHINT, ni Schneider, ni Mean Well, ni Delta, ni EduVolt).

### 2.5 Estados vivos y legibles
- Colores saturados: verde `#12c41a`/`#22d33a`, rojo `#ff2d20`, ámbar `#ffae00`, azul `#1f6fd1`.
- Indicadores de equipo con la convención del fabricante: ventana roja «I» = cerrado o energizado,
  verde «O» = abierto.
- Primero el mecanismo real: la palanca sube, la perilla gira, el portacontactos baja, el capuchón se hunde
  (más chico y más oscuro). Solo si el mecanismo no se lee, se agrega un aviso (`DISPARÓ`, `SOBRECARGA`).
- El daño (`damaged`) afecta al cuerpo (hollín) y lleva su rótulo.

### 2.6 Personalidad por tipo
Cada tipo se distingue sin leer el rótulo:

| Tipo | Rasgo propio |
|---|---|
| Piloto 22 mm y AD16 | aro negro con el símbolo de lámpara ⊗ en la lente |
| Pulsador | aro claro, capuchón casi del ancho del cuerpo |
| Pulsador luminoso | aro claro + lente con ⊗ |
| Parada de emergencia | hongo rojo sobre placa amarilla |
| Selector | perilla negra con maneta y franja blanca |
| Termomagnético | módulos con palanca negra y ventana roja/verde |
| Contactor | símbolo de contactos impreso, ventana del portacontactos, placa de bobina |
| Relé térmico | puentes de cobre arriba, dial azul, STOP rojo cuadrado, RESET azul |
| Guardamotor | perilla rotativa grande O / TRIP / I y bloque auxiliar lateral |
| Fuentes | MDR plástica con rejilla, HDR escalonada, NDR metálica con aletas |
| SSR | cuerpo negro con placa blanca |
| Motor | carcasa con aletas axiales, tapa del ventilador y bornera arriba |

### 2.7 Lo que no se hace
- **Degradados**: nunca, solo color plano.
- Copiar el dibujo de otro simulador (EduVolt, CodePLC…): se toma la idea, no el trazo.
- Textos encima de otros o tapados por rejillas.

---

## 3. Proceso de trabajo

1. Mirar fotos del equipo real (catálogo o equipo propio) para la silueta, las piezas y el orden de bornes.
2. Dibujar en el generador de su familia (`herramientas/v3/fam_*.py`), reutilizando `scr`, `lab`, `T`,
   `brand` y `led` (tablero) o `kit.replica()` (campo y proceso).
3. Hoja de revisión con reposo y activo junto al dibujo anterior, y captura en el Sim con un ejercicio
   que lo use.
4. Validar: `checkSymbolSvg` sin problemas, `audit-grilla`, `e2e-dispositivos` y `e2e-neumatica` en PASS.
5. Aprobación de JW Control.

### Lista de control
- [ ] Proporción del equipo real a 4 px/mm (o la escala fija de campo).
- [ ] Contorno oscuro grueso; zonas en grises planos; sin degradados.
- [ ] Bornes: `cx` múltiplo de 20, orden real, tornillo grande, rótulo en negrita con relieve.
- [ ] Franja JW con un dato; un dato grande; sin texto de relleno; sin marcas de terceros.
- [ ] Estados con el mecanismo real y colores vivos; daño en el cuerpo.
- [ ] Se distingue de los demás tipos sin leer el rótulo.
- [ ] Sin textos superpuestos; `id` con prefijo del tipo; sin `<script>`, `<foreignObject>` ni `on…`.
