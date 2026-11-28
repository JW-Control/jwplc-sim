<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-8/49-el-panel-web.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 49: El panel web: la banda en el celular

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [46](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/46-la-red-del-tablero/) y la [47](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/47-servidor-modbus-tcp/)

En la lección 47, la oficina miraba la banda con JW Modbus Tool. Funciona, pero hay que instalar un programa y saber qué es cada registro. El supervisor de turno quiere algo más simple: abrir el celular y ver cuántas cajas lleva la banda. Para eso el JWPLC Basic trae un **panel web**.

## Un panel que se arma solo

La librería `JWPLC_Web` sirve una página desde el propio JWPLC. No hay que escribir HTML: el programa dice qué variables quiere mostrar y el panel las ordena, con su nombre y su unidad, y las refresca cada segundo.

| Pestaña del panel | Qué muestra |
|---|---|
| Inicio | Las variables publicadas, en vivo |
| Alarmas | Alarmas activas, reconocidas y su historial (lección 51) |
| Tendencias | La historia de las variables que se guardan (lección 51) |
| Pantalla | La pantalla del JWPLC en vivo, con la botonera |
| Equipo | IP, sesiones y usuarios |

## Primer ingreso: sin clave de fábrica

Un equipo nuevo no tiene usuarios ni contraseña de fábrica. La primera vez, el panel pide un **código de 6 dígitos** que el JWPLC escribe en el Monitor Serie (y en su pantalla, en el Runtime: MENU › Red › Conectar celular). Con ese código se crea el usuario **administrador**. Solo quien tiene el equipo delante puede leerlo, y por eso puede reclamarlo.

> [!WARNING] Solo dentro de la planta
> El panel va por HTTP dentro de la red local. No abras puertos del router hacia el JWPLC: para verlo desde afuera se usa JW Cloud o una VPN.

## Lo que necesitas

- El JWPLC Basic en la red, como en la lección 46 (aquí con DHCP del router).
- El sensor fotoeléctrico B1 y el contactor KM1 de la lección 47.
- Dos pulsadores: S1 de marcha (NA) y S2 de parada (NC).
- Un celular o una PC conectados a la misma red.

## Conexiones

1. **`I0.0`**: salida del sensor B1 (marrón a +24 V, azul a 0 V, negro a I0.0).
2. **`I0.1`**: pulsador S1, contacto NA desde +24 V.
3. **`I0.2`**: pulsador S2, contacto NC desde +24 V.
4. **`Q0.0`**: bobina del contactor KM1.
5. Cable de red al router o al switch.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 8.Ethernet_y_Modbus_TCP → 49.El_panel_web. Necesita el package 2.1.0-alpha.19 o posterior, que trae la librería JWPLC_Web.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 8, lección 49. El panel del JWPLC simulado se abre en el navegador de tu PC, o en tu celular si está en el mismo Wi-Fi.

## Cómo funciona el programa

### Arrancar el panel

```cpp
JWPLC_Web.begin("Banda de cajas");
```

Abre el panel en el puerto 80 con ese nombre en la cabecera. Empieza a atender en cuanto la red tiene IP; el `loop()` no tiene que hacer nada más.

### Publicar variables

```cpp
JWPLC_Web.publish("cajas", cajas).label("Cajas contadas").unit("u");
JWPLC_Web.publish("banda", banda).label("Banda en marcha");
```

`publish()` recibe un **id**, que es el nombre corto de la variable para el panel, y la variable del programa. Lo que va después con puntos es opcional: la etiqueta que lee la persona y la unidad. El panel lee la variable directamente: por eso tiene que ser **global**, declarada fuera de `setup()` y `loop()`. Se puede publicar un `bool`, `int`, `long`, `unsigned long` o `float`.

### La dirección del panel

```cpp
if (!avisado && JWPLC_Web.url().length() > 0)
```

`url()` devuelve la dirección para el navegador, por ejemplo `http://192.168.1.50/`, y queda vacía mientras la red no tiene IP. El programa la escribe una sola vez.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200: sale la dirección del panel y el código de primer ingreso.
2. Abre la dirección en el navegador del celular, escribe el código y elige tu usuario y tu clave (10 caracteres o más).
3. Arranca la banda con S1 y pasa cajas frente a B1: en **Inicio**, las cajas suben y «Banda en marcha» cambia, sin recargar la página.

```text
Lección 49: panel web de la banda
[JWPLC_Web] Primer ingreso: abrir el panel y escribir el codigo 534141
Panel web: http://192.168.1.50/
Caja 1
Caja 2
```

## Si algo no funciona

- **No sale «Panel web: …»:** la red no tiene IP. Revisa el cable y el diagnóstico de la lección 46.
- **El navegador no abre la página:** el celular tiene que estar en la misma red que el JWPLC, no en los datos móviles.
- **El código no funciona:** cambia cada 60 s. Usa el último que salió en el Monitor Serie.
- **Una variable no aparece en el panel:** se publica en `setup()` y debe ser global.

## Para practicar

- **Tiempo de marcha:** publica también cuántos segundos lleva la banda en marcha. Declara `unsigned long marchaSegundos`, súmale 1 cada segundo con la banda en marcha (con `millis()`, como en la lección 06) y publícala con el id «marcha_s», la etiqueta «Tiempo de marcha» y la unidad «s».

## Resumen

- `JWPLC_Web` arma un panel web con las variables que el programa publica, sin escribir HTML.
- `publish(id, variable)` muestra una variable global; `label()` y `unit()` le ponen nombre y unidad.
- El primer ingreso pide el código de 6 dígitos del equipo y crea al administrador.

En la siguiente lección, [Consignas desde el celular](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/50-consignas-desde-el-celular/), el panel no solo mira: también cambia la meta del lote.
