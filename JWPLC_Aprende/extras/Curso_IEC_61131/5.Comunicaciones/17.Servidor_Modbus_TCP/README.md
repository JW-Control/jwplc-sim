# Curso IEC 61131-3 · Lección 17 · Servidor Modbus TCP: la PC mira y manda

<!-- Generado por scripts/iec/wiki.mjs desde scripts/iec/textos.mjs y lecciones.mjs. -->

Una banda cuenta cajas y el jefe de producción quiere verlas desde la oficina, y arrancar la banda sin bajar al tablero. El JWPLC y la PC están en la misma red Ethernet; el idioma común es **Modbus TCP**. En la ruta C++ es la lección 47; aquí el servidor se configura en el **OpenPLC Editor** y el programa solo usa variables.

## Qué vas a aprender

- A agregar el servidor Modbus TCP a un proyecto del OpenPLC Editor y darle al JWPLC una IP fija.
- Qué tabla de Modbus es cada dirección IEC: %QX son bobinas y %MW son holding.
- A leer lo que escribe la PC y a escribir lo que la PC lee, con variables comunes.

## Cómo funciona el programa

El flanco de B1 suma una caja en `CAJAS` (como en la lección 14). La banda sigue a la orden de la PC: `KM1 := MARCHA <> 0;`. En Ladder, la suma es un bloque **ADD** detrás de un contacto de flanco y la comparación un bloque **NE** por EN/ENO; en FBD, **R_TRIG**, **SEL** con **ADD**, y **NE**. Nada en el programa habla de la red: el servidor del proyecto presta `CAJAS` y `MARCHA` tal cual.

## Qué conectar

- Ethernet · servidor Modbus TCP del proyecto, puerto 502
- %IX0.0 · B1, sensor de cajas
- %QX0.0 · KM1, banda (bobina 00001)
- %MW0 · 40001 cajas
- %MW1 · 40002 marcha
- %MW2 · 40003 meta
- PC1 · JW Modbus Tool

## Para practicar

- Meta desde la PC: la PC escribe la meta de cajas en el 40003; al llegarla, el programa pone la marcha (40002) en 0 y la banda para sola.
- Ejecuta el ejemplo y espera «en línea» en la PC PC1: el 40001 cuenta las cajas y la bobina 00001 muestra la banda.
- Arrastra el 40002 de la PC a un valor distinto de 0: la banda KM1 arranca. Acciona B1 y mira sumar el 40001.
- Declara META AT %MW2 (40003). Si META > 0 y CAJAS >= META, escribe 0 en MARCHA: la banda para y la PC lo ve.

## En JWPLC Sim

1. Pulsa **Ejecutar** y espera unos segundos: la PC **PC1** del **Esquema** dice «en línea».
2. Arrastra a la derecha el valor del **40002** en la PC: **KM1** cierra y la bobina **00001** se enciende.
3. Acciona el sensor **B1** desde su símbolo: el **40001** cuenta las cajas.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.
