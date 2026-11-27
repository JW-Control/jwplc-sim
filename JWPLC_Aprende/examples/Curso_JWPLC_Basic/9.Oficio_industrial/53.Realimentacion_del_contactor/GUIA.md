<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-9/53-realimentacion-del-contactor.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 53: Diagnóstico: ¿el contactor hizo caso?

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** la lección [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/)

Que el programa ponga `Q0.0` en `HIGH` no quiere decir que el motor gire. La bobina puede estar cortada, un cable suelto, el contactor trabado. Y al revés: el programa manda parar y los contactos se quedaron **soldados** por un arco.

La solución de oficio es la **realimentación**: el contacto auxiliar NA del contactor (13-14) vuelve a una entrada. El programa compara lo que **mandó** con lo que **pasó**.

| Orden | Auxiliar | Después de 300 ms |
|---|---|---|
| Cerrar | Abierto | Falla: no cierra |
| Abrir | Cerrado | Falla: contactos pegados |
| Igual | Igual | Todo bien |

Un contactor tarda unos 20 ms en cerrar; 300 ms dejan margen de sobra sin demorar el aviso.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un motor con contactor de bobina 24 V DC y su guardamotor.
- Un pulsador de marcha (NA) y uno de parada (NC).
- Una lámpara roja de 24 V DC.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha (NA). **`I0.1`**: parada (NC).
3. **`+24 V`** → auxiliar **13-14** de KM1 → **`I0.2`**.
4. **`Q0.0`**: bobina de KM1. **`Q0.1`**: lámpara H1 de falla.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 9.Oficio_industrial → 53.Realimentacion_del_contactor. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 9, lección 53. Los equipos ya vienen cableados en el **Esquema**; las fallas (bobina cortada, contactos soldados, cable cortado) se provocan con clic derecho sobre cada equipo.

## Cómo funciona el programa

### El tiempo de respuesta

```cpp
if (motor != ordenAntes)
    cambioOrden = millis();
```

Cada vez que la orden cambia, se anota la hora. Recién cuando pasan 300 ms desde ese cambio se compara con el auxiliar: antes, el contactor todavía puede estar moviéndose.

### La falla queda enclavada

Al detectar «no cierra», `falla = true` y el motor se bloquea. No se borra sola cuando la causa desaparece: hace falta que alguien la **reconozca** con ESC. Así el técnico se entera aunque la falla haya sido de un instante.

### Lo que no se puede arreglar por programa

Con los contactos soldados, el programa ya no puede parar el motor: solo avisar. Por eso los tableros tienen un guardamotor o un segundo contactor aguas arriba.

## Súbelo y pruébalo

1. Sube el programa y arranca: el motor gira y no hay falla.
2. Desconecta la bobina de KM1 y da marcha: a los 300 ms, «Falla KM1: no cierra».
3. Reconoce con ESC y vuelve a conectar la bobina.

```text
Lección 53: realimentación de KM1 en I0.2, falla H1 en Q0.1, ESC reconoce
Motor en marcha
Motor detenido
Motor en marcha
Falla KM1: no cierra
Motor detenido
Falla reconocida
```

## Si algo no funciona

- **«No cierra» en cada arranque:** el auxiliar está cableado al 21-22 (NC) en vez del 13-14 (NA), o no le llega tensión.
- **La falla salta al parar:** el tiempo de respuesta es muy corto para ese contactor; súbelo.

## Para practicar

- **Contactor pegado:** si se mandó abrir y a los 300 ms el auxiliar sigue cerrado, «Falla KM1: contactos pegados» una vez, H1 encendida y la marcha bloqueada.

## Resumen

- La realimentación compara la orden con lo que pasó.
- Se compara después de un tiempo de respuesta.
- Las fallas quedan enclavadas hasta que alguien las reconoce.

En la siguiente lección, [Horómetro](https://jw-control.com/wiki/curso-jwplc-basic/unidad-9/54-horometro-y-mantenimiento/), el tablero cuenta las horas de marcha.
