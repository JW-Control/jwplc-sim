# Curso JWPLC Basic · Lección 53 · Diagnóstico: ¿el contactor hizo caso?

## Qué vas a aprender

- Qué es la realimentación de un contactor y para qué sirve.
- A comparar lo que el programa mandó con lo que pasó, con un tiempo de respuesta.
- Por qué una falla queda enclavada hasta que alguien la reconoce.

## Qué conectar

- Contacto auxiliar NA de KM1 (13-14) a I0.2.
- I0.0: marcha (NA). I0.1: parada (NC).
- Q0.0: bobina de KM1. Q0.1: lámpara H1 de falla.

## Cómo probarlo

1. Sube el programa y arranca: el motor gira y no hay falla.
2. Desconecta la bobina de KM1 y da marcha: a los 300 ms, «Falla KM1: no cierra».
3. Reconoce con ESC y conecta la bobina otra vez.

## Para practicar

- Contactor pegado: si se mandó abrir y a los 300 ms el auxiliar sigue cerrado, «Falla KM1: contactos pegados» una vez, H1 encendida y la marcha bloqueada.

## En JWPLC Sim

<!-- La clase de la wiki está escrita para el equipo físico; en el Sim, su sección «Súbelo y pruébalo» se reemplaza por esta. -->

1. Pulsa **Ejecutar** y aprieta **S1**: **KM1** cierra y el auxiliar vuelve a I0.2.
2. Clic derecho sobre **KM1** → Falla → Bobina cortada, y da marcha otra vez: aparece la falla.
3. Prueba también **contactos soldados**: el motor no para con la parada.

```text
Lección 53: realimentación de KM1 en I0.2, falla H1 en Q0.1, ESC reconoce
Motor en marcha
Motor detenido
Motor en marcha
Falla KM1: no cierra
Motor detenido
Falla reconocida
```
