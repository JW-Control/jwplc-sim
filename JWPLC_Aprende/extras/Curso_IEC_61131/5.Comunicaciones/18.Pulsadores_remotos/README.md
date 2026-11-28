# Curso IEC 61131-3 · Lección 18 · Pulsadores remotos: la PC pide y el programa acusa

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

En la lección anterior la PC dejaba un valor fijo en el 40002 y la banda lo seguía. En planta, las órdenes de un SCADA casi nunca son así: son **pulsos**, como un botón. La PC escribe «quiero marcha», el PLC lo hace y le contesta «hecho». Esa respuesta es el **acuse**, y aquí sale gratis: el programa devuelve la orden a 0.

## Qué vas a aprender

- A recibir órdenes de la PC como pulsadores remotos en holding (%MW).
- A acusar una orden devolviéndola a 0 para que no se repita.
- A combinar las órdenes de la red con una memoria de marcha (Set/Reset).

## Cómo funciona el programa

Cada orden es un `IF`: si el holding es distinto de 0, se hace la orden y se escribe 0. MARCHA pone `KM1 := TRUE` y PARO `KM1 := FALSE`. En Ladder, un bloque **NE** por EN/ENO deja la orden en un BOOL (`O_MARCHA`), ese contacto activa la bobina **S** (o **R**) de KM1 y un **MOVE** de 0 hace el acuse. En FBD, `KM1` es la memoria `(KM1 OR MARCHA) AND NOT PARO` y cada orden se borra con **SEL**.

## Qué conectar

- Ethernet · servidor Modbus TCP del proyecto, puerto 502
- %IX0.0 · B1, sensor de cajas
- %QX0.0 · KM1, banda (bobina 00001)
- %MW0 · 40001 cajas
- %MW1 · 40002 MARCHA
- %MW2 · 40003 PARO
- %MW3 · 40004 CERO
- PC1 · JW Modbus Tool

## Para practicar

- Contador a cero desde la PC: un tercer pulsador remoto en el 40004 pone el 40001 en 0 y el programa lo acusa devolviéndolo a 0.
- Ejecuta el ejemplo y espera «en línea» en la PC PC1. Arrastra el 40002 (MARCHA): la banda arranca y el 40002 vuelve solo a 0.
- Acciona B1 un par de veces y mira el 40001. Arrastra el 40003 (PARO): la banda para y el 40003 vuelve a 0.
- Declara P_CERO AT %MW3 (40004). Si es distinto de 0, pon CAJAS en 0 y devuelve P_CERO a 0.

## En JWPLC Sim

1. Pulsa **Ejecutar** y espera unos segundos: la PC **PC1** del **Esquema** dice «en línea».
2. Arrastra a la derecha el valor del **40002** (MARCHA): **KM1** cierra y el 40002 vuelve solo a 0.
3. Acciona el sensor **B1**: el **40001** cuenta. Arrastra el **40003** (PARO): la banda para y el 40003 vuelve a 0.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
