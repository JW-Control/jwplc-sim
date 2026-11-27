<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-4/20-el-buzzer.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 20: El buzzer: avisos que se oyen

**Nivel:** intermedio · **Tiempo:** unos 35 minutos · **Necesitas:** las lecciones [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [19](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/19-la-botonera-del-frente/)

Una faja de 30 metros arranca. En la otra punta, alguien estaba limpiando un rodillo. Por eso las máquinas grandes **avisan antes de moverse**: una bocina suena unos segundos y recién después arranca el motor. Y cuando algo falla, una alarma suena hasta que una persona la atiende.

El JWPLC Basic trae su propio **buzzer**. En esta lección lo vas a usar para las dos cosas.

## El buzzer suena solo

El buzzer está en el objeto **`JWPLC_Buzzer`**. Lo importante: **no detiene el programa**. Le das la orden, el package lo hace sonar en segundo plano y tu `loop()` sigue trabajando. No hay ningún `delay()`.

| Función | Qué hace |
|---|---|
| `JWPLC_Buzzer.beep()` | Un pitido corto (60 ms, 2000 Hz) |
| `JWPLC_Buzzer.beep(300, 600)` | Un pitido de 300 ms a 600 Hz (grave) |
| `JWPLC_Buzzer.play(NOTAS, cantidad)` | Toca una melodía una vez |
| `JWPLC_Buzzer.play(NOTAS, cantidad, true)` | La toca en bucle, hasta `stop()` |
| `JWPLC_Buzzer.stop()` | Calla el buzzer |
| `JWPLC_Buzzer.setVolume(64)` | Volumen de 0 a 255 |

### Una melodía es una lista de notas

```cpp
const JWPLC_BuzzerNote AVISO[] = {
    {2000, 300}, {0, 200},
    {2000, 300}, {0, 200},
    {2000, 300}, {0, 200}};
```

Cada nota es `{frecuencia en Hz, duración en ms}`, y la frecuencia `0` es un silencio. Este aviso son tres pitidos de 300 ms separados por 200 ms de silencio: 1,5 segundos en total.

Para decirle a `play()` cuántas notas tiene la lista se usa `sizeof(AVISO) / sizeof(AVISO[0])`: el tamaño de toda la lista dividido entre el tamaño de una nota. Si agregas notas, la cuenta se ajusta sola.

> [!NOTE] Frecuencias
> Unos 2000 Hz es un pitido agudo que se oye bien en una planta con ruido. Un sonido grave (300 a 600 Hz) suele usarse para «no se puede». Dos tonos que se alternan, como la alarma de este ejemplo, se distinguen de cualquier otro aviso.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Un pulsador NA (marcha) y uno NC (paro).
- Un relé térmico con su contacto 95-96 (NC), o un pulsador NC que haga de térmico.
- Un contactor con bobina de 24 V DC y una lámpara de 24 V DC para la falla.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: MARCHA (NA). **`I0.1`**: PARO (NC). **`I0.2`**: contacto 95-96 del térmico (NC). Todos desde **+24 V**.
3. **`Q0.0`**: bobina del contactor del motor. **`Q0.1`**: lámpara de falla.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 4.El_equipo_por_dentro → 20.El_buzzer. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 4, lección 20. Sube el volumen de la PC: el Sim hace sonar el buzzer.

## Cómo funciona el programa

### Primero el aviso, después el motor

```cpp
if (marcha && !motor && !avisando && !falla)
{
    avisando = true;
    inicioAviso = millis();
    JWPLC_Buzzer.play(AVISO, sizeof(AVISO) / sizeof(AVISO[0]));
    Serial.println("Aviso de arranque");
}
```

MARCHA no arranca el motor: arranca el **aviso**. Durante esos 2 segundos el programa está en un estado intermedio, `avisando`. Cuando pasan los 2 segundos (temporizador de la [lección 06](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/06-tiempo-sin-delay/)), recién ahí `motor = true`. Si alguien aprieta PARO durante el aviso, el arranque se cancela.

### Una alarma que se reconoce

Una alarma bien hecha tiene tres momentos:

1. **Aparece:** el térmico salta. El motor para, la lámpara enciende y el buzzer suena en bucle (`play(..., true)`).
2. **Se reconoce:** alguien aprieta OK. El buzzer se calla, pero la falla **sigue**: la lámpara queda encendida, porque el térmico todavía está abierto.
3. **Se normaliza:** el térmico vuelve a cerrar y, como ya fue reconocida, la falla termina.

```cpp
if (falla && reconocida && !termico)
{
    falla = false;
}
```

¿Por qué no apagar todo cuando el térmico vuelve? Porque el térmico se rearma solo en muchos modelos: si nadie vio la falla, el motor volvería a arrancar sin que nadie revisara por qué se calentó.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. MARCHA: suenan tres pitidos y, a los 2 segundos, arranca el motor.
3. Con el motor en marcha, abre el térmico: el motor para, la lámpara enciende y suena la alarma.
4. OK en la botonera: la alarma se calla. Cierra el térmico: la lámpara se apaga.

```text
Lección 20: marcha I0.0, paro NC I0.1, térmico NC I0.2, motor Q0.0, falla Q0.1
Aviso de arranque
Motor en marcha
Falla: térmico
Alarma reconocida
Térmico normal
```

## Si algo no funciona

- **No suena nada:** revisa `setVolume()`; con 0 el buzzer está mudo.
- **El programa se queda trabado mientras suena:** usaste `tone()` con `delay()` de otro ejemplo. Con `JWPLC_Buzzer` no hace falta esperar.
- **La alarma vuelve a empezar sola:** la condición de la falla se cumple en cada vuelta. Por eso se pregunta `termico && !falla`: la alarma arranca una sola vez.

## Para practicar

- **Lámpara que parpadea:** mientras la alarma no esté reconocida, la lámpara de falla parpadea (medio segundo encendida, medio apagada); reconocida, queda fija. Pista: `(millis() / 500) % 2 == 0` alterna entre verdadero y falso cada medio segundo.
- **Arranque bloqueado:** durante una falla, MARCHA no arranca. Escribe `Bloqueado: térmico abierto` y da un tono grave con `JWPLC_Buzzer.beep(300, 600)`.

## Resumen

- `JWPLC_Buzzer` suena en segundo plano: el `loop()` sigue trabajando.
- Una melodía es una lista de notas `{frecuencia, duración}`; frecuencia 0 es silencio.
- Una máquina grande avisa **antes** de arrancar.
- Una alarma aparece, se reconoce y se normaliza: reconocer calla el sonido, pero no borra la falla.

En la siguiente lección, [El reloj](https://jw-control.com/wiki/curso-jwplc-basic/unidad-4/21-el-reloj/), encenderás una carga por horario con el reloj del equipo.
