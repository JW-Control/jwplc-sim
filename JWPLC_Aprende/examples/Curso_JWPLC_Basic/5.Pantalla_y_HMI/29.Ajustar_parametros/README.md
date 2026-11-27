# Curso JWPLC Basic · Lección 29 · Ajustar parámetros desde el frente

## Qué vas a aprender

- Editar un parámetro en la pantalla como en un equipo comercial: OK edita, UP y DOWN cambian, OK guarda, ESC cancela.
- Editar sobre una copia: la máquina sigue con el valor viejo hasta que se confirma.
- Límites y pasos fijos para que el operador no ponga valores absurdos.
- Liberar ESC (IDLE_RETURN_DISABLED) cuando la pantalla lo necesita para cancelar.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: pulsador de MARCHA (NA). I0.1: pulsador de PARADA (NC).
- Q0.0: contactor de la mezcladora.

## Cómo probarlo

1. Sube el programa: la pantalla muestra la mezcladora y el tiempo de mezcla, 20 s.
2. OK: el aviso EDITA se pone amarillo. UP sube de a 5 s; OK guarda.
3. MARCHA: la mezcladora marcha el tiempo ajustado y el campo «Falta» cuenta hacia atrás.

## Para practicar

- Guarda el tiempo en la FRAM al confirmarlo y recupéralo al arrancar
  («Recuperado: 30 s»).
- Con la mezcladora en marcha, OK no entra a editar: escribe «Detén la
  mezcladora para ajustar».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y abre la pestaña **Placa**.
2. Aprieta **OK** (o **Enter**): el aviso **EDITA** se pone amarillo. Sube con **UP** (flecha arriba) y guarda con **OK**. **ESC** cancela.
3. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha**: **KM1** se cierra y **Falta** cuenta hacia atrás.
4. Para probar la FRAM de la práctica, detén la simulación y vuelve a ejecutar: el Sim conserva la memoria como el equipo real.

```text
Lección 29: ajustar desde el frente, marcha I0.0, parada NC I0.1
Tiempo: 20 s
Editando
Tiempo: 25 s
Mezclando 25 s
Mezcla terminada
```
