# Curso JWPLC Basic · Lección 52 · Parada de emergencia y rearme

## Qué vas a aprender

- Por qué la emergencia corta por cable y el programa solo la registra.
- Por qué soltar la seta no debe arrancar nada: el rearme.
- A ordenar la máquina en estados: normal, emergencia y espera de rearme.

## Qué conectar

- ES: seta de emergencia, contacto 11-12 NC. Alimenta el común de Q0.0 y vuelve a I0.3.
- I0.0: marcha (NA). I0.1: parada (NC). I0.2: rearme (NA, azul).
- Q0.0: bobina de KM1. Q0.1: lámpara H1 de emergencia.

## Cómo probarlo

1. Sube el programa y arranca el motor con marcha.
2. Aprieta la seta: el motor para y H1 se enciende.
3. Suelta la seta: el motor no vuelve. Aprieta rearme y después marcha.

## Para practicar

- En EMERGENCIA, H1 parpadea una vez por segundo; en ESPERA_REARME queda fija.
- Si se aprieta rearme con la seta apretada: «Libere la emergencia antes de rearmar».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: **KM1** cierra.
2. Aprieta la seta **ES** en su símbolo: **KM1** cae aunque el programa no hiciera nada.
3. Gírala para soltarla, aprieta **S3** (Rearme) y otra vez **S1**.

```text
Lección 52: emergencia NC I0.3, rearme I0.2, marcha I0.0, parada NC I0.1
Motor en marcha
EMERGENCIA
Motor detenido
Emergencia liberada: apriete Rearme
Rearmado: la máquina espera una marcha
Motor en marcha
```
