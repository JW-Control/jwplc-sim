# Curso JWPLC Basic · Lección 12 · Clases: un motor con sus funciones

## Qué vas a aprender

- Qué es una clase: el plano de un equipo, con sus datos y lo que sabe
  hacer.
- Crear objetos con ese plano y manejarlos con objeto.funcion(), como
  Serial.println().
- Por qué los datos van en private: nadie los cambia sin pasar por las
  funciones de la clase.

## Qué conectar

- Borne 1M a 0 V.
- I0.0: marcha de la bomba 1 (NA). I0.1: parada de la bomba 1 (NC).
- I0.2: marcha de la bomba 2 (NA). I0.3: parada de la bomba 2 (NC).
- Q0.0: bobina del contactor de la bomba 1.
- Q0.1: bobina del contactor de la bomba 2.

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Un toque a la marcha de la bomba 1 cierra Q0.0 y se queda cerrado.
3. La bomba 2 funciona igual con sus pulsadores, sin tocar a la bomba 1.
4. Cada cambio se avisa por el Monitor Serie con el nombre de la bomba.

## Para practicar

- Agrega una lámpara «Bombeando» en Q0.2, encendida mientras al menos una
  bomba esté en marcha.
- Agrega a la clase un contador de arranques y muéstralo en el mensaje:
  «Bomba 1 en marcha (arranque 2)».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la pestaña **Serie**. Las paradas **S2** y **S4** son NC: en reposo `I0.1` e `I0.3` ya están activas.
2. En **Mandos** (panel **Reto**) da un toque a **S1 Marcha B1**: `Q0.0` cierra **KM1** y se queda cerrado.
3. Da un toque a **S3 Marcha B2**: `Q0.1` cierra **KM2**. Las dos bombas funcionan a la vez, cada una con su estado.
4. **S2** detiene solo la bomba 1 y **S4** solo la bomba 2.

```text
Lección 12: bomba 1 en I0.0/I0.1, bomba 2 en I0.2/I0.3
Bomba 1 en marcha
Bomba 2 en marcha
Bomba 1 detenida
```
