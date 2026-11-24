# Curso JWPLC Basic · Lección 21 · El reloj: encender por horario

## Qué vas a aprender

- Leer la fecha y la hora del reloj del equipo (RTC) con JWPLC_Time.
- Pasar una hora a segundos del día para comparar horarios con números.
- Encender y apagar una carga por horario.
- Falla segura: sin hora válida, no se adivina.

## Qué conectar

- Borne 1M a 0 V.
- Q0.0: contactor del alumbrado. Q0.1: lámpara de aviso (para practicar).
- El reloj del equipo tiene su propia batería: sigue contando sin energía.

## Cómo probarlo

1. Ajusta la hora del equipo (el ejemplo SetFromBuildTime de la librería
   JW_RTC la toma de la PC).
2. Sube el programa y abre el Monitor Serie a 115200 baudios.
3. Cambia ENCENDIDO a un minuto después de la hora actual y espera: el
   contactor se cierra a esa hora.

## Para practicar

- Aviso previo: los 5 segundos antes de encender, la lámpara de Q0.1
  parpadea (250 ms encendida, 250 ms apagada).
- Fin de semana: sábado y domingo la vitrina no enciende. Escribe «Fin de
  semana: alumbrado apagado». dayOfWeek() da 1 el domingo y 7 el sábado.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. En esta práctica el reloj del Sim arranca a las **17:59:50** de un martes. Pulsa **Ejecutar** y mira la pestaña **Serie**.
2. Espera unos 10 segundos: a las 18:00:00 **KM1** se cierra.
3. Para probar otro día u otra hora, cambia ENCENDIDO y APAGADO en el código: el reloj del Sim siempre arranca a las 17:59:50.

```text
Lección 21: alumbrado por horario, KM1 en Q0.0
Horario: de 18:00:00 a 23:00:00
17:59:59 · alumbrado apagado
18:00:00 · alumbrado ENCENDIDO
```
