# Curso JWPLC Basic · Lección 57 · Proyecto: el tablero de una bomba de pozo

## Qué vas a aprender

- A juntar en un tablero la emergencia, las fallas enclavadas, la realimentación y el horómetro.
- A registrar cada evento con su hora.
- A ordenar las protecciones en una función que decide el estado.

## Qué conectar

- I0.0: marcha (NA). I0.1: parada (NC). I0.2: auxiliar 13-14 de KM1.
- I0.3: emergencia (NC, también corta el común de Q0.0). I0.4: térmico F1 (NC). I0.5: rearme (NA).
- Q0.0: KM1. Q0.1: H1 falla o emergencia. Q0.2: H2 bomba en marcha.

## Cómo probarlo

1. Sube el programa y arranca la bomba: H2 se enciende.
2. Prueba la emergencia, el térmico y una bobina desconectada: cada una deja su evento con hora.
3. Rearme sirve para la emergencia y para reconocer una falla sin causa.

## Para practicar

- Como máximo 3 arranques en 60 s; el cuarto no arranca y escribe «Demasiados arranques: espere».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: **KM1** cierra y **H2** se enciende.
2. Aprieta la seta **ES**, suéltala y aprieta **S3**.
3. Clic derecho sobre **KM1** → Falla → Bobina cortada: «Falla: KM1 no cierra».

```text
Lección 57: tablero de bomba de pozo
Horómetro: 0 s de marcha
10:00:01 Bomba en marcha
10:00:03 EMERGENCIA
10:00:04 Emergencia liberada: apriete Rearme
10:00:05 Rearmado
```
