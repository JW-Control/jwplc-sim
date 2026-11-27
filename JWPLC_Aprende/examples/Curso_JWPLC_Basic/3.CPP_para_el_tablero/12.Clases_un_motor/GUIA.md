<!-- Copia de la wiki (wiki/curso-jwplc-basic/unidad-3/12-clases-un-motor.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 12: Clases: un motor con sus funciones

**Nivel:** intermedio · **Tiempo:** unos 30 minutos · **Necesitas:** las lecciones [08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/) y [09](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/09-temporizadores/)

Un tablero de bombeo tiene dos bombas. Las dos se arrancan y se paran igual: un pulsador de marcha, una parada normalmente cerrada y un aviso cuando cambian. Si copias la marcha y parada de la lección 08 dos veces, tienes el doble de líneas y el doble de lugares donde equivocarte. Y el día que cambies la regla, tendrás que acordarte de cambiarla en las dos copias.

En esta unidad aprenderás el C++ que se usa en los programas de tablero de verdad. Empezamos por la herramienta más importante: la **clase**.

## Una clase es el plano de un equipo

Piensa en el plano de un motor en un catálogo. Dice qué datos tiene (en qué relé está conectado, cómo se llama, si está en marcha) y qué sabe hacer (arrancar, parar). Con ese único plano se fabrican todos los motores que haga falta, y cada uno tiene sus propios datos.

| Palabra | Qué es | En el ejemplo |
|---|---|---|
| **Clase** | El plano: los datos y las funciones de un tipo de equipo | `Motor` |
| **Objeto** | Un equipo hecho con ese plano, con sus propios datos | `bomba1`, `bomba2` |
| **Función de la clase** (método) | Lo que el objeto sabe hacer | `arrancar()`, `parar()`, `controlar()` |

Ya usaste objetos sin saberlo. `Serial` es un objeto, y `println()` es una de sus funciones: por eso escribes `Serial.println()`. Con tus propias clases vas a escribir igual: `bomba1.arrancar()`, `bomba2.estaEnMarcha()`. Primero el objeto, un punto y la función.

## Lo que necesitas

- El JWPLC Basic y una fuente de 24 V DC.
- Dos pulsadores normalmente abiertos (marcha) y dos normalmente cerrados (parada).
- Dos contactores con bobina de 24 V DC, o dos lámparas que los reemplacen.

## Conexiones

1. **`1M`** al **0 V** de la fuente.
2. **`I0.0`**: marcha de la bomba 1 (NA) y **`I0.1`**: parada de la bomba 1 (NC), los dos desde **+24 V**.
3. **`I0.2`**: marcha de la bomba 2 (NA) y **`I0.3`**: parada de la bomba 2 (NC), los dos desde **+24 V**.
4. **`Q0.0`**: bobina del contactor de la bomba 1. **`Q0.1`**: bobina del contactor de la bomba 2. Como en la [lección 08](https://jw-control.com/wiki/curso-jwplc-basic/unidad-2/08-marcha-y-parada/#conexiones), el relé del PLC maneja la bobina, nunca el motor directo.

## El programa

> [!NOTE] El ejemplo
> El mismo programa viene en la librería JWPLC_Aprende de JWPLC Sim: Curso_JWPLC_Basic → 3.CPP_para_el_tablero → 12.Clases_un_motor. Llega con la próxima versión del simulador; mientras tanto, copia el programa de aquí.

<!-- programa -->

> [!TIP] Pruébalo en JWPLC Sim
> Si aún no tienes la placa, corre este programa en [JWPLC Sim](https://jw-control.com/herramientas/jwplc-sim/), el simulador gratuito del JWPLC Basic: en **Aprender**, Unidad 3, lección 12. Trae el banco con las dos bombas ya cableado y una práctica que se califica sola.

## Cómo funciona el programa

Vamos por partes.

### El plano: `class Motor`

```cpp
class Motor
{
public:
    ...
private:
    ...
};
```

Todo lo que está entre las llaves es el plano. Tiene dos partes:

- **`public:`** lo que se puede usar desde fuera, desde `loop()`: las funciones `controlar()`, `arrancar()`, `parar()` y `estaEnMarcha()`.
- **`private:`** lo que solo la clase puede tocar: los datos. Desde `loop()` no puedes escribir `bomba1.enMarcha = true`; el compilador no te deja. La única forma de arrancar la bomba es `bomba1.arrancar()`, que además avisa por el Monitor Serie. Así ningún pedazo del programa cambia el estado de un motor «por la puerta de atrás».

Fíjate en el punto y coma después de la última llave: `};`. Es fácil olvidarlo, y el compilador se queja con un mensaje confuso.

### Los datos de cada motor

```cpp
uint16_t salida;
String nombre;
bool enMarcha = false;
```

Cada motor guarda tres cosas: el relé que maneja, su nombre para los mensajes y si está en marcha. `uint16_t` es un número entero sin signo de 16 bits: el tipo de `Q0_0` a `Q0_7`. `String` es un texto que se puede unir con `+`, como en `nombre + " en marcha"`.

### El constructor

```cpp
Motor(uint16_t rele, String texto)
{
    salida = rele;
    nombre = texto;
}
```

Es una función especial: se llama igual que la clase, no devuelve nada (ni siquiera `void`) y se ejecuta **una vez**, cuando se crea el objeto. Aquí anota qué relé y qué nombre le tocan a cada motor.

### Crear los objetos

```cpp
Motor bomba1(Q0_0, "Bomba 1");
Motor bomba2(Q0_1, "Bomba 2");
```

Igual que `bool marcha = false;` crea una variable de tipo `bool`, esto crea dos objetos de tipo `Motor`. Los datos entre paréntesis van al constructor. Desde aquí, `bomba1` y `bomba2` son dos equipos independientes: cada uno tiene su `enMarcha`.

### Las funciones de la clase

```cpp
void controlar(bool marcha, bool paradaSinApretar)
{
    if (marcha && paradaSinApretar)
    {
        arrancar();
    }
    if (!paradaSinApretar)
    {
        parar();
    }
    digitalWrite(salida, enMarcha);
}
```

Es la marcha y parada de la lección 08, con el sello guardado en `enMarcha`. Dentro de la clase, las funciones usan los datos del objeto **sin poner nada delante**: `enMarcha` es el de `bomba1` cuando se llamó `bomba1.controlar(...)` y el de `bomba2` cuando se llamó `bomba2.controlar(...)`. Lo mismo con `arrancar()`: dentro de la clase se llama directo, sin objeto ni punto.

La parada va **después** de la marcha. Si alguien aprieta las dos a la vez, gana la parada: es lo seguro.

```cpp
void arrancar()
{
    if (!enMarcha)
    {
        enMarcha = true;
        Serial.println(nombre + " en marcha");
    }
}
```

`arrancar()` solo hace algo si el motor estaba detenido. Así el aviso sale una sola vez por arranque, aunque el pulsador quede apretado muchas vueltas de `loop()`.

```cpp
bool estaEnMarcha()
{
    return enMarcha;
}
```

Como `enMarcha` es privado, el resto del programa pregunta por él con esta función. Devuelve el dato sin dejar cambiarlo.

### El `loop()` queda corto

```cpp
bomba1.controlar(digitalRead(I0_0) == HIGH, digitalRead(I0_1) == HIGH);
bomba2.controlar(digitalRead(I0_2) == HIGH, digitalRead(I0_3) == HIGH);
```

Dos líneas, una por bomba. Se lee como lo diría un técnico: «la bomba 1 se controla con `I0.0` y `I0.1`». Si mañana el tablero tiene una tercera bomba, se agrega un objeto y una línea; la regla de marcha y parada sigue escrita una sola vez.

## Súbelo y pruébalo

1. Sube el programa y abre el Monitor Serie a 115200 baudios.
2. Da un toque a la marcha de la bomba 1: `Q0.0` se cierra y se queda cerrado. El Monitor Serie dice `Bomba 1 en marcha`.
3. Arranca la bomba 2 con su pulsador: `Q0.1` se cierra. Las dos funcionan a la vez.
4. Aprieta la parada de la bomba 1: se abre solo `Q0.0`. La bomba 2 sigue.

```text
Lección 12: bomba 1 en I0.0/I0.1, bomba 2 en I0.2/I0.3
Bomba 1 en marcha
Bomba 2 en marcha
Bomba 1 detenida
```

## Si algo no funciona

- **Error de compilación cerca del final de la clase:** falta el punto y coma después de la llave de cierre: `};`.
- **`'bool Motor::enMarcha' is private`:** intentaste leer o cambiar un dato privado desde `loop()`. Usa la función de la clase: `bomba1.estaEnMarcha()`.
- **Ninguna bomba arranca:** las paradas son NC. Con la parada sin conectar, la entrada está apagada y el programa la toma como apretada.
- **Una bomba maneja el relé de la otra:** revisa los datos de los objetos: `Motor bomba2(Q0_1, ...)`.

## Para practicar

- Agrega una lámpara «Bombeando» en `Q0.2`, encendida mientras al menos una bomba esté en marcha. Pregúntale a cada objeto con `estaEnMarcha()`.
- Agrega a la clase un dato privado que cuente los arranques, y muéstralo en el mensaje: `Bomba 1 en marcha (arranque 2)`. ¿La bomba 2 empieza su propia cuenta en 1?

## Resumen

- Una **clase** es el plano de un equipo: sus datos y sus funciones. Un **objeto** es un equipo hecho con ese plano, con sus propios datos.
- Los objetos se usan con `objeto.funcion()`, igual que `Serial.println()`.
- El **constructor** prepara cada objeto al crearlo.
- **`private`** protege los datos: solo las funciones de la clase los cambian.
- La lógica de un equipo se escribe una vez y sirve para todos los equipos iguales.

En la siguiente lección, [Arreglos de objetos](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/13-arreglos-de-objetos/), manejarás cuatro cintas transportadoras con una sola línea y un `for`.
