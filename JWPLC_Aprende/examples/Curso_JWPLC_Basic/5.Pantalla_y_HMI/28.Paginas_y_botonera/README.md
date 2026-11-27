# Curso JWPLC Basic · Lección 28 · Páginas: la botonera recorre la pantalla

## Qué vas a aprender

- Repartir los campos en páginas: cada campo dice en qué página va.
- Cambiar de página con setUserPage() y la botonera (LEFT y RIGHT).
- Mostrar duraciones (mm:ss) y la fecha y hora del RTC sin escribir código para formatearlas.
- Que la misma tecla haga cosas distintas según la página.

## Qué conectar

- El tanque de la lección 27: B1 en I0.0, B2 en I0.1, selector en I0.2.
- Q0.0: bomba (KM1). Q0.1: descarga (Y1). Q0.2: lámpara de nivel bajo (H1).

## Cómo probarlo

1. Sube el programa: la pantalla muestra la página PROCESO.
2. RIGHT pasa a CONTADORES (llenados y horómetro de la bomba) y luego a RELOJ.
3. LEFT vuelve atrás. ESC lleva a la pantalla de estado del equipo y OK regresa.

## Para practicar

- Haz que las páginas den la vuelta: RIGHT en la última va a la primera y
  LEFT en la primera va a la última. Escribe «Página N de 4».
- Agrega una página 4, MANTENIMIENTO: con OK en esa página, llenados y
  horómetro vuelven a cero y se escribe «Contadores a cero». En las otras
  páginas OK no hace nada.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**.
2. Aprieta **RIGHT** en la botonera (o la flecha derecha del teclado): pasas a **CONTADORES** y luego a **RELOJ**. **LEFT** vuelve.
3. En **Mandos** (panel **Reto**) pon **S1** en **I** y vuelve a **CONTADORES**: el horómetro de la bomba avanza.

```text
Lección 28: páginas, LEFT y RIGHT; tanque B1 I0.0, B2 I0.1, selector I0.2
Página 1
Página 2
Página 3
Página 2
```
