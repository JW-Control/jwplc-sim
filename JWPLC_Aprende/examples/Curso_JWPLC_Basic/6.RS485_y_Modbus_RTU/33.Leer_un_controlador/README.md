# Curso JWPLC Basic · Lección 33 · El bus RS-485: leer un controlador de temperatura

## Qué vas a aprender

- Qué son el bus RS-485 y el protocolo Modbus RTU: un maestro que pregunta y esclavos que responden.
- A arrancar el JWPLC como maestro con `JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1)`.
- A leer registros input (función 04) con `readInputRegistersSync()`.
- A convertir un registro en décimas a grados, con signo.

## Qué conectar

- Bornes RS-485 del JWPLC: A con A y B con B del controlador de temperatura (dirección 1, 9600 8N1).
- Alimentación del controlador según su modelo.
- Q0.0: lámpara de alarma (para la práctica).

## Cómo probarlo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Cada segundo aparece la temperatura que mide el controlador.
3. Desconecta el cable A o B: aparece «Sin respuesta del controlador» con el motivo.

## Para practicar

- Lee 2 registros desde el 0. El segundo es el estado: escribe «Calentando» o «Resistencia apagada» cuando cambia el bit 0.
- Con el bit 1 (alarma), escribe «Alarma de temperatura» una vez y enciende H1 (Q0.0).

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar**: cada segundo, la consola muestra la temperatura de **TC1**.
2. En **Mandos** (panel **Reto**) cambia la temperatura de **TC1**: la lectura siguiente la muestra.
3. Su consigna es 40 °C: bajo 38 °C su salida calienta; desde 50 °C da alarma.

```text
Lección 33: Modbus RTU, controlador de temperatura en la dirección 1
Temperatura: 25.0 °C
Temperatura: 25.0 °C
Temperatura: 45.0 °C
```
