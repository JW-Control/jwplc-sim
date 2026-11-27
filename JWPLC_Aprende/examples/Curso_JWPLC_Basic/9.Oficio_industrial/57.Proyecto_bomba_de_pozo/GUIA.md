<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-9/57-proyecto-bomba-de-pozo.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 57: Proyecto: el tablero de una bomba de pozo

**Nivel:** intermedio · **Tiempo:** unos 60 minutos · **Necesitas:** las lecciones [52](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/52-parada-de-emergencia/) a [56](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/56-primera-falla/)

El proyecto de la unidad: el tablero de una **bomba de pozo profundo**. Un pozo está lejos y nadie lo mira: el tablero tiene que protegerse solo y dejar dicho qué pasó.

| Entrada | | Salida | |
|---|---|---|---|
| `I0.0` | Marcha (NA) | `Q0.0` | KM1, bomba |
| `I0.1` | Parada (NC) | `Q0.1` | H1, falla o emergencia |
| `I0.2` | Auxiliar 13-14 de KM1 | `Q0.2` | H2, bomba en marcha |
| `I0.3` | Emergencia (NC, corta `Q0.0`) | | |
| `I0.4` | Térmico F1 (NC) | | |
| `I0.5` | Rearme (NA) | | |

Junta la emergencia con rearme (52), la realimentación (53), el horómetro (54) y los eventos con hora (56). **Rearme** sirve para las dos cosas: rearmar la emergencia y reconocer una falla, si su causa ya no está.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- La bomba con contactor (con auxiliar 13-14), térmico y guardamotor.
- Marcha, parada, seta de emergencia, rearme y dos lámparas.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).
3. **`+24 V`** → seta **11-12** → común de **`Q0.0`** y **`I0.3`**.
4. **`I0.2`**: auxiliar 13-14 de KM1. **`I0.4`**: térmico F1 (NC). **`I0.5`**: rearme.
5. **`Q0.0`**: KM1. **`Q0.1`**: H1. **`Q0.2`**: H2.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 9.Oficio_industrial → 57.Proyecto_bomba_de_pozo. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 9, lección 57. Los equipos ya vienen cableados en el **Esquema**; las fallas (bobina cortada, contactos soldados, cable cortado) se provocan con clic derecho sobre cada equipo.

## Cómo funciona el programa

### Una función que vigila

```cpp
void vigilar(bool setaSuelta, bool termicoBien, bool cerrado, bool rearme)
```

Todas las protecciones están en un solo lugar y en orden de importancia: primero la emergencia, después el térmico, después la realimentación y al final el rearme. Cada cambio pasa por `irA()`, que para la bomba y deja el evento con su hora.

### Cuatro estados

`LISTO`, `EMERGENCIA`, `ESPERA_REARME` y `FALLA`. La bomba solo puede andar en `LISTO`; H1 se enciende en cualquier otro.

### Eventos con hora

`evento()` antepone la hora a cada línea. Es lo que el técnico lee cuando llega al pozo: qué pasó y cuándo. En la [lección 23](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/23-la-microsd/) aprendiste a guardar estas líneas en la microSD.

## Súbelo y pruébalo

1. Sube el programa y arranca la bomba: H2 se enciende.
2. Prueba la emergencia, el térmico y una bobina desconectada: cada una deja su evento con hora.
3. Rearme sirve para la emergencia y para reconocer una falla sin causa.

```text
Lección 57: tablero de bomba de pozo
Horómetro: 0 s de marcha
10:00:01 Bomba en marcha
10:00:03 EMERGENCIA
10:00:04 Emergencia liberada: apriete Rearme
10:00:05 Rearmado
```

## Si algo no funciona

- **«KM1 no cierra» al arrancar:** revisa el auxiliar 13-14 y su cable a `I0.2`.
- **El rearme no reconoce la falla:** el térmico sigue abierto; espera a que enfríe.

## Para practicar

- **Arranques por minuto:** como máximo 3 arranques en 60 s. Guarda en un arreglo los `millis()` de los últimos 3; si el más viejo fue hace menos de 60 s, el cuarto no arranca y escribe «Demasiados arranques: espere».

## Resumen

- Un tablero junta emergencia, fallas, realimentación y horómetro.
- Las protecciones van juntas, en orden de importancia.
- Cada evento deja su hora.

Con esta lección terminas la **Unidad 9** y la ruta C++ del curso hasta aquí. Vuelve al [temario](https://jw-control.com/wiki/curso-jwplc-basic/) para ver lo que viene.
