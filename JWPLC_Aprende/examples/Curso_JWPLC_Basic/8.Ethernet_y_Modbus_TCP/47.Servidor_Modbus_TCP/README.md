# Curso JWPLC Basic · Lección 47 · El JWPLC servidor Modbus TCP: la PC mira y manda

## Qué vas a aprender

- Qué es Modbus TCP: el Modbus de la Unidad 6 por Ethernet, con IP y puerto 502.
- A hacer del JWPLC un servidor con `setCoils()`, `setHoldingRegisters()` y `beginServer()`.
- A leer lo que manda la PC (una bobina) y publicar lo que la PC lee (holding).

## Qué conectar

- I0.0: sensor fotoeléctrico B1 de las cajas (PNP, 24 V DC).
- Q0.0: contactor KM1 de la banda.
- Cable de red; una PC en la misma red con JW Modbus Tool.

## Cómo probarlo

1. Sube el programa y conecta JW Modbus Tool a 192.168.250.10, puerto 502, Unit ID 1.
2. Escribe 1 en la bobina 00001: la banda arranca y el 40002 pasa a 1.
3. Pasa cajas por B1: el 40001 las cuenta.

## Para practicar

- La PC escribe la meta en el 40003; al llegarla, la banda para sola y se escribe «Meta cumplida: N cajas».

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y mira la PC **PC1** en el **Esquema**: tras unos segundos dice «en línea».
2. Clic en la bobina **00001** de la PC: **KM1** cierra y el 40002 pasa a 1.
3. Acciona el sensor **B1** desde su símbolo: el 40001 cuenta las cajas.
4. Para escribir un holding desde la PC, arrastra su valor a izquierda o derecha.

```text
Lección 47: servidor Modbus TCP, cajas en 40001, marcha en la bobina 00001
Banda en marcha (desde la PC)
Caja 1
Caja 2
```
