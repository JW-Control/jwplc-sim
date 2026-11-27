# Curso JWPLC Basic · Lección 30 · Alarmas en pantalla

## Qué vas a aprender

- Declarar ventanas de alarma con `setPopups()` y abrirlas con `showPopup()`.
- Los dos estados de una alarma: si la causa sigue y si alguien la reconoció.
- Detectar el reconocimiento: la ventana CRIT se cierra con OK y `popupActive()` pasa a `false`.
- La lámpara de falla según la norma: parpadea sin reconocer, fija si la causa sigue, apagada cuando todo pasó.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador de MARCHA (NA). I0.1: pulsador de PARADA (NC). I0.2: contacto del térmico (NC).
- Q0.0: contactor de la bomba. Q0.1: lámpara de falla.

## Cómo probarlo

1. Sube el programa y arranca la bomba con MARCHA.
2. Abre el térmico: la bomba para, aparece la ventana roja A01 TERMICO y H1 parpadea.
3. OK cierra la ventana: H1 queda fija mientras el térmico siga abierto y se apaga cuando vuelve a cerrar.

## Para practicar

- Con una alarma sin reconocer, MARCHA no arranca: escribe «Reconozca la alarma A01» (como mucho una vez por segundo).
- Aviso A02 (ventana WARN): con la bomba más de 15 s en marcha, «Alarma A02: marcha larga», una vez por arranque. La bomba sigue.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: **KM1** se cierra.
3. Abre **F1 Térmico**: aparece la ventana **A01 TERMICO** y **H1** parpadea.
4. Aprieta **OK** (o **Enter**) para reconocerla: **H1** queda fija hasta que cierres **F1**.

```text
Lección 30: alarmas, marcha I0.0, parada NC I0.1, térmico NC I0.2, falla Q0.1
Bomba en marcha
Alarma A01: térmico
Bomba detenida
A01 reconocida
A01: térmico normal
```
