<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-8/50-consignas-desde-el-celular.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 50: Consignas desde el celular

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [49](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/49-el-panel-web/)

La banda ahora trabaja por lotes: el jefe de producción decide cuántas cajas lleva cada lote y la banda para sola al completarlo. El número cambia según el pedido del día, y nadie quiere bajar al tablero a cambiarlo en el programa. Lo cambia desde el celular.

## Una variable que el panel puede escribir

Lo publicado es de solo lectura, salvo que el programa diga quién puede cambiarlo:

```cpp
JWPLC_Web.publish("meta", meta).label("Meta del lote").range(1, 100).writable(WEB_OPERADOR);
```

- **`writable(rol)`**: el rol mínimo que puede cambiarla. En el panel aparece el botón «Cambiar valor».
- **`range(mín, máx)`**: el panel rechaza un valor fuera de ese rango y el programa nunca lo ve.

## Los roles

Cada usuario del panel tiene un rol. El administrador los crea en la pestaña **Equipo**:

| Rol | Qué puede hacer |
|---|---|
| `WEB_VISOR` | Mirar |
| `WEB_OPERADOR` | Cambiar consignas, reconocer alarmas, usar la botonera de la Pantalla |
| `WEB_TECNICO` | Lo del operador y ver la auditoría |
| `WEB_ADMIN` | Todo, también los usuarios |

El panel guarda quién cambió qué, con el valor de antes y el de después: es la **auditoría** de la pestaña Equipo.

## Lo que necesitas

- El mismo tablero de la lección 49: B1, S1, S2 y KM1, y el JWPLC en la red.

## Conexiones

Las de la lección 49: B1 en `I0.0`, S1 en `I0.1`, S2 en `I0.2` y KM1 en `Q0.0`.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 8.Ethernet_y_Modbus_TCP → 50.Consignas_desde_el_celular. Necesita el package 2.1.0-alpha.19 o posterior, que trae la librería JWPLC_Web.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> En JWPLC Sim: **Aprender**, Unidad 8, lección 50. En el panel, «Cambiar valor» en la meta del lote; después arranca con S1 y acciona el sensor B1 desde su símbolo.

## Cómo funciona el programa

### La meta, desde el panel

```cpp
JWPLC_Web.publish("meta", meta).label("Meta del lote").unit("u").range(1, 100).writable(WEB_OPERADOR);
```

Cuando un operador cambia la meta en el panel, la librería escribe la variable `meta` del programa. El `loop()` la usa como cualquier otra: no hay que leer nada de la red.

### Parar al completar el lote

```cpp
if (banda && cajas >= meta)
{
    banda = false;
    ...
}
```

Con la meta cumplida, la banda para sola y avisa una vez. Al pulsar S1 con el lote completo, el contador vuelve a 0 y empieza un lote nuevo.

## Súbelo y pruébalo

1. Entra al panel como en la lección 49. En **Inicio**, «Cambiar valor» en la «Meta del lote» y escribe 3.
2. Arranca con S1 y pasa 3 cajas frente a B1: la banda para sola.
3. Prueba una meta de 500: el panel avisa que está fuera de rango.

```text
Lección 50: la meta del lote se cambia desde el panel web
Panel web: http://192.168.1.50/
Caja 1 de 3
Caja 2 de 3
Caja 3 de 3
Meta cumplida: 3 cajas
```

## Si algo no funciona

- **No aparece «Cambiar valor»:** falta `writable()`, o tu usuario tiene un rol menor que el pedido (un Visor no cambia nada).
- **El panel dice «fuera de rango»:** el valor no está dentro de `range()`.
- **La banda no para en la meta:** revisa que la comparación sea `cajas >= meta`; con `==`, una caja de más la salta.

## Para practicar

- **Contador a cero desde el panel:** publica `bool reiniciar` con el id «reiniciar» y `writable(WEB_OPERADOR)`. Cuando vale verdadero, el programa pone `cajas` en 0, devuelve `reiniciar` a falso y escribe «Contador a cero desde el panel». Volver la orden a falso es el **acuse**: el operador ve en el panel que la orden se cumplió, y no se repite.

## Resumen

- `writable(rol)` deja cambiar una variable desde el panel; `range()` pone el mínimo y el máximo.
- Los roles van de Visor a Administrador, y cada cambio queda en la auditoría.
- Una orden de un toque se cumple una vez y se devuelve a falso.

En la siguiente lección, [Alarmas y tendencia](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/51-alarmas-y-tendencia/), el panel avisa cuando algo sale mal.
