# Curso IEC 61131-3 · Lección 15 · Contar el tiempo: un horómetro con mantenimiento

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Los motores, compresores y bombas se mantienen por **horas de marcha**: cambio de aceite cada 500 h, rodamientos cada 2 000 h. El PLC lleva la cuenta con un **horómetro**, un número que sube mientras el equipo trabaja. En el Sim se cuenta en segundos para no esperar horas.

## Qué vas a aprender

- Un generador de pulsos: un TON que se reinicia con su propia salida.
- A acumular tiempo en un INT sumando pulsos.
- A usar ese número en comparaciones: aviso y bloqueo de mantenimiento.

## Cómo funciona el programa

El ejemplo enciende H1 (mantenimiento) a los 20 s. En una planta, el aviso llega antes de que haga falta parar, para programar el trabajo, y el bloqueo llega después, si nadie lo hizo. La práctica arma las dos cosas con dos comparaciones sobre el mismo número: `>= 10` avisa y `< 20` deja marchar al motor. En Ladder, el bloqueo es un contacto más en el peldaño de la marcha, alimentado por un bloque LT.

## Qué conectar

- %IX0.0 · S1, marcha
- %IX0.1 · S2, paro NC
- %QX0.0 · KM1, motor
- %QX0.1 · H1, mantenimiento

## Para practicar

- Aviso de mantenimiento H1 a los 10 s de marcha y, a los 20 s, el motor se detiene y no vuelve a arrancar.
- Ejecuta el ejemplo: con S1 el motor marcha y SEGUNDOS sube uno por segundo (míralo en las variables en vivo).
- Adelanta el aviso H1 a los 10 s.
- Agrega el bloqueo: el motor marcha solo mientras SEGUNDOS < 20.
- Pasados los 20 s, S1 ya no lo arranca.

## En JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: el motor marcha.
2. Mira **SEGUNDOS** en las variables en vivo: sube uno por segundo.
3. A los 20 s, H1 (mantenimiento) se enciende.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
