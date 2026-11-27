<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-9/56-primera-falla.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 56: Primera falla: ¿qué pasó primero?

**Nivel:** intermedio · **Tiempo:** unos 40 minutos · **Necesitas:** la lección [21](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/) (el reloj)

Un compresor tiene tres protecciones: el térmico del motor, el presostato de aceite y el nivel de aceite. Una dispara y el motor para. Pero sin motor, la presión de aceite cae y también dispara el presostato. El técnico llega y ve **dos** fallas: ¿cuál fue la causa?

Los tableros serios tienen un **indicador de primera falla** (*first-out*): memoriza la que llegó **primero**, con su hora, y anota las demás como consecuencias.

| Entrada | Protección |
|---|---|
| `I0.2` | F1, térmico (NC) |
| `I0.3` | B2, presostato de aceite (NC) |
| `I0.4` | B3, nivel de aceite (NC) |

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- El compresor con su contactor, térmico, presostato de aceite y nivel, todos con contacto NC.
- Un pulsador de marcha (NA), uno de parada (NC) y una lámpara roja.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).
3. **`I0.2`**, **`I0.3`** e **`I0.4`**: las tres protecciones (NC).
4. **`Q0.0`**: bobina de KM1. **`Q0.1`**: lámpara H1 de falla.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 9.Oficio_industrial → 56.Primera_falla. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 9, lección 56. Los equipos ya vienen cableados en el **Esquema**; las fallas (bobina cortada, contactos soldados, cable cortado) se provocan con clic derecho sobre cada equipo.

## Cómo funciona el programa

### Tablas en vez de tres copias

```cpp
const int ENTRADAS[] = {I0_2, I0_3, I0_4};
const String NOMBRES[] = {"TERMICO", "PRESION DE ACEITE", "NIVEL DE ACEITE"};
```

Las protecciones van en tablas y un `for` las recorre. Una cuarta protección es una entrada más en cada tabla.

### Primera o «también»

Cada protección se **anota** una sola vez (`anotada[k]`). La primera que se anota con el tablero sin disparo es la **primera falla** y lleva la hora del reloj ([lección 21](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/)); las siguientes se escriben como «También».

### Reconocer sin causas

ESC borra todo, pero solo si `causaActiva()` devuelve `NINGUNA`. Reconocer con una protección todavía abierta haría arrancar la máquina con la falla presente.

## Súbelo y pruébalo

1. Sube el programa y arranca el compresor.
2. Abre el térmico y después el nivel: la consola marca la primera y anota la segunda.
3. Cierra las dos y aprieta ESC: «Fallas reconocidas».

```text
Lección 56: primera falla, térmico I0.2, presión I0.3, nivel I0.4 (NC), ESC reconoce
Compresor en marcha
Primera falla: TERMICO a las 10:00:03
Compresor detenido
También: NIVEL DE ACEITE
Fallas reconocidas
```

## Si algo no funciona

- **Marca falla al encender:** una protección está cableada como NA o le falta tensión.
- **ESC no hace nada:** queda alguna causa activa (ese es el ejercicio de la práctica).

## Para practicar

- **Explicar el ESC:** si ESC llega con una causa todavía activa, «No se puede reconocer: NOMBRE sigue activa», con el nombre de esa causa.

## Resumen

- La primera falla dice la causa; las otras son consecuencias.
- Tablas y un `for` en vez de copiar código.
- Se reconoce solo sin causas activas.

En la siguiente lección, [Proyecto: bomba de pozo](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/57-proyecto-bomba-de-pozo/), juntas todo en un tablero.
