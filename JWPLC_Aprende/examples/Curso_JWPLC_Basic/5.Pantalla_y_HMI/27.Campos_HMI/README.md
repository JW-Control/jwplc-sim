# Curso JWPLC Basic · Lección 27 · Campos HMI: el tanque en la pantalla

## Qué vas a aprender

- Declarar los campos de la pantalla (texto, piloto, valor y barra) en una tabla, sin dibujar a mano.
- Actualizarlos con setText(), setBool(), setValue() y setBar(): el package repinta solo lo que cambió.
- Elegir el refresco ON_DEMAND para que la pantalla no gaste tiempo si nada cambia.
- Mostrar el avance de un proceso con una barra.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: sensor B1, nivel bajo (30 %). I0.1: sensor B2, tanque lleno (80 %).
- I0.2: selector «Habilitar».
- Q0.0: contactor KM1 de la bomba. Q0.1: electroválvula Y1 de descarga. Q0.2: lámpara H1 de nivel bajo.

## Cómo probarlo

1. Sube el programa y pon el selector en I.
2. La bomba llena hasta B2: la pantalla dice LLENANDO, el piloto pasa a MARCHA y la barra avanza.
3. Al llenarse, el estado pasa a EN NIVEL y el contador de llenados sube.

## Para practicar

- Agrega un campo «Último llenado» en segundos y escribe «Llenado en N s»
  en el Monitor Serie cada vez que el tanque se llena.
- Vigila el llenado: si la bomba pasa de 20 s sin llegar a B2, escribe
  «Falla: llenado lento», para la bomba y muestra FALLA hasta que el
  selector vuelva a 0.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa** para ver los campos.
2. En **Mandos** (panel **Reto**) pon **S1** en **I**: la bomba arranca, el estado dice **LLENANDO** y la barra avanza. El tanque se ve en **Esquema eléctrico**.
3. A los 18 s el agua llega a **B2**: la bomba para y **Llenados** pasa a 1.
4. Para probar la vigilancia de la práctica, en el esquema quema el motor **M1** (clic derecho, **Fallas**).

```text
Lección 27: campos HMI, tanque B1 I0.0, B2 I0.1, selector I0.2
Bomba en marcha
Tanque lleno. Llenados: 1
```
