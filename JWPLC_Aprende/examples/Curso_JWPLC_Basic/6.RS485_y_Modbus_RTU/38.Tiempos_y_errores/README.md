# Curso JWPLC Basic · Lección 38 · Tiempos y errores: cuando un equipo no responde

## Qué vas a aprender

- Qué es el timeout de una pregunta Modbus y qué pasa con el programa mientras espera.
- La API cooperativa: `requestReadInputRegisters()`, `task()`, `masterDone()`, `masterSucceeded()` y `clearMasterResult()`.
- A contar fallas seguidas para distinguir un error suelto de un equipo perdido.
- Falla segura: qué hace la máquina cuando deja de saber.

## Qué conectar

- El controlador de temperatura en el bus (dirección 1), como en la lección 33.
- Q0.0: contactor de la resistencia. Q0.1: lámpara de alarma de comunicación.

## Cómo probarlo

1. Sube el programa: la resistencia se enciende bajo 38 °C y se apaga en 40 °C.
2. Desconecta el cable A del bus: cada medio segundo aparece «TC1 no responde» con el motivo.
3. Fíjate en el problema: la resistencia sigue como estaba, con un dato viejo.

## Para practicar

- Con 3 fallas seguidas: «Falla de comunicación con TC1» una vez, la resistencia apagada y H1 (Q0.1) encendida.
- Con la primera respuesta buena: «Comunicación recuperada», H1 apagada y el control vuelve.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: a 30 °C, **KM1** (la resistencia) se cierra.
2. En el **Esquema**, corta el cable entre **RS485 A** y **TC1.A** (clic derecho sobre el cable): la consola cuenta las preguntas sin respuesta.
3. Vuelve a conectarlo: las lecturas siguen.

```text
Lección 38: control por el bus, resistencia Q0.0, alarma Q0.1
Resistencia encendida a 30.0 °C
TC1 no responde (1): Timeout
TC1 no responde (2): Timeout
TC1 no responde (3): Timeout
```
