# Curso JWPLC Basic · Lección 41 · Control on-off: el hidroneumático

## Qué vas a aprender

- Qué es un control on-off y cómo reemplaza a un presostato.
- Por qué los dos límites (histéresis) protegen al motor.
- Qué hacer con la bomba si se pierde la medida.

## Qué conectar

- PT1: transmisor de presión en la dirección 1.
- Q0.0: bobina del contactor KM1 de la bomba (24 V DC). El motor, por el contactor y su protección.

## Cómo probarlo

1. Sube el programa con el tanque descargado: la bomba arranca bajo 3,0 bar.
2. Espera: al llegar a 5,0 bar la bomba para.
3. Abre un grifo: la presión baja y la bomba vuelve a arrancar en 3,0 bar.

## Para practicar

- Tiempo mínimo de marcha: una vez que arranca, la bomba trabaja al menos 10 s aunque la presión llegue a 5,0 bar.
- Al parar, escribe «Bomba parada tras N s».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: **KM1** se cierra y la presión de **RED1** sube.
2. Baja el consumo de **RED1** a 0: la bomba llega a 5,0 bar en pocos segundos y para.
3. Sube el consumo: la bomba vuelve a arrancar bajo 3,0 bar.

```text
Lección 41: control on-off, bomba KM1 en Q0.0, arranca < 3,0 bar, para en 5,0 bar
Bomba en marcha a 2.50 bar
Bomba parada a 5.01 bar
```
