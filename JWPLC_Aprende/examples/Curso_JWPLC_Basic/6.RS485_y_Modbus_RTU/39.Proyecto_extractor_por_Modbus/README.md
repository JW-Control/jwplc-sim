# Curso JWPLC Basic · Lección 39 · Proyecto: el extractor de un horno, todo por Modbus

## Qué vas a aprender

- A tener tres equipos en el mismo bus: variador, controlador de temperatura y módulo de E/S remotas.
- A recorrer el bus por turnos, una pregunta a la vez, sin detener el `loop()`.
- Por qué al variador se le escribe en todas las vueltas: para si pasa 3 s sin noticias del maestro.
- A decidir la falla segura según la máquina: en un horno, ventilar es lo seguro.

## Qué conectar

- VF1 (variador del extractor) en la dirección 1, TC1 (controlador del horno) en la 2 e IO1 (E/S remotas) en la 3, todos en el mismo par A/B.
- IO1: DI1 selector «Automático», DO1 lámpara de marcha.

## Cómo probarlo

1. Sube el programa con el selector en manual: el extractor queda parado.
2. Pasa a automático y calienta el horno: a 40 °C arranca a 30 Hz y desde 50 °C va a 60 Hz.
3. Fíjate en la consola: cada turno sin respuesta dice cuál fue y por qué.

## Para practicar

- Con 3 fallas seguidas al leer TC1: «Sin temperatura: extractor al máximo» una vez, el extractor a 60 Hz y H2 (DO2) encendida.
- Con la primera lectura buena: «Temperatura recuperada», H2 apagada y la velocidad vuelve a seguir a la temperatura.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y gira **S1** a automático.
2. Sube la temperatura de **TC1** a 45 °C: **VF1** arranca a 30 Hz y la lámpara de marcha se enciende.
3. En el **Esquema**, corta el cable **A** entre **IO1** y **TC1**: la consola muestra el turno 0 sin respuesta, pero el variador y el módulo siguen contestando.

```text
Lección 39: extractor por Modbus, VF1 dir. 1, TC1 dir. 2, IO1 dir. 3
Extractor: 0 Hz (30.0 °C)
Extractor: 30 Hz (45.0 °C)
Extractor: 60 Hz (55.0 °C)
Turno 0 sin respuesta: Timeout
```
