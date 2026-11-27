# Curso JWPLC Basic · Lección 56 · Primera falla: ¿qué pasó primero?

## Qué vas a aprender

- Qué es la primera falla (first-out) y por qué dice la causa.
- A memorizar la primera con su hora y anotar las demás.
- A reconocer solo cuando ya no queda ninguna causa activa.

## Qué conectar

- I0.2: térmico F1 (NC). I0.3: presostato de aceite B2 (NC). I0.4: nivel de aceite B3 (NC).
- I0.0: marcha (NA). I0.1: parada (NC).
- Q0.0: bobina de KM1. Q0.1: lámpara H1 de falla.

## Cómo probarlo

1. Sube el programa y arranca el compresor.
2. Abre el térmico y después el nivel: la consola marca la primera y anota la segunda.
3. Cierra las dos y aprieta ESC: «Fallas reconocidas».

## Para practicar

- Si ESC llega con una causa todavía activa: «No se puede reconocer: NOMBRE sigue activa», con el nombre de esa causa.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**.
2. Mantén apretado **F1** y después **B3** (simulan el térmico y el nivel): mira la consola.
3. Suéltalos y aprieta **ESC** en la botonera.

```text
Lección 56: primera falla, térmico I0.2, presión I0.3, nivel I0.4 (NC), ESC reconoce
Compresor en marcha
Primera falla: TERMICO a las 10:00:03
Compresor detenido
También: NIVEL DE ACEITE
Fallas reconocidas
```
