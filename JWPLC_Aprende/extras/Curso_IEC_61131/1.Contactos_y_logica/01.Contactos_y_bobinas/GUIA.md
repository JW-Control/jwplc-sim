<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-1/01-contactos-y-bobinas.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 01: Contactos y bobinas

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 03 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-1/03-leer-una-entrada/)

El JWPLC Basic también se programa con los lenguajes de la norma **IEC 61131-3**, los mismos de cualquier PLC industrial: texto estructurado (**ST**), diagrama de contactos (**Ladder**, LD) y diagrama de bloques de función (**FBD**). Se escriben en el **OpenPLC Editor** y se prueban en **JWPLC Sim** con el mismo banco que la ruta en C++.

En esta lección vas a hacer el programa más corto posible: una luz que sigue a un pulsador. Lo vas a ver en los tres lenguajes, porque los tres dicen lo mismo.

## Qué vas a aprender

- Qué es una variable ubicada: `AT %IX0.0` es la entrada I0.0 y `AT %QX0.0` la salida Q0.0.
- Qué son un contacto y una bobina, y cómo se escriben en ST y FBD.
- A invertir una entrada: contacto cerrado en Ladder, `NOT` en ST, bloque NOT en FBD.

## Variables ubicadas

En IEC 61131-3 cada entrada y salida de la placa es una dirección: `%IX0.0` a `%IX0.7` son las entradas I0.0 a I0.7 y `%QX0.0` a `%QX0.7` las salidas Q0.0 a Q0.7 (la X dice que son de un bit, BOOL). En el programa se les da un nombre que diga qué son:

```iecst
VAR
  S1 AT %IX0.0 : BOOL;  (* pulsador *)
  H1 AT %QX0.0 : BOOL;  (* piloto *)
END_VAR
```

Desde ahí, el programa habla de `S1` y `H1`, no de bornes. Si mañana el pulsador pasa a otra entrada, se cambia una sola línea.

## Contactos y bobinas

En Ladder, una **bobina** es una salida que se enciende cuando le llega corriente desde el riel de la izquierda; un **contacto abierto** deja pasar la corriente si su variable está en TRUE, y un **contacto cerrado** (con la barra) la deja pasar si está en FALSE. En ST lo mismo es una asignación: `H1 := S1;`. En FBD, una variable de entrada unida con un hilo a una de salida.

| Ladder | ST | FBD |
|---|---|---|
| Contacto abierto de S1 | `S1` | Variable S1 |
| Contacto cerrado de S1 | `NOT S1` | Bloque NOT |
| Bobina de H1 | `H1 := …;` | Variable de salida H1 |

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0 : BOOL; (* pulsador NA *)
    S2 AT %IX0.1 : BOOL; (* pulsador NA *)
    H1 AT %QX0.0 : BOOL; (* piloto verde *)
    H2 AT %QX0.1 : BOOL; (* piloto amarillo *)
  END_VAR

  (* H1 sigue a S1: encendido mientras el pulsador esté apretado. *)
  H1 := S1;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 335 106" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 335px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 10)"><path stroke-width="3" d="M1.5 8V76M321.5 8V76"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M210 50H321.5"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect data-sig="Q0_0" x="179" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M182 50H188M204 50H210"/><path d="M192 40Q186 50 192 60M200 40Q206 50 200 60"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 10)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; H1 sigue a S1 &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">S1</text><text x="196" y="32" text-anchor="middle" font-weight="600">H1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 01, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 0 358 62" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 358px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M162 36H260"/><rect x="50" y="20" width="128" height="32" rx="16"/><rect x="260" y="20" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="114" y="40" text-anchor="middle" font-weight="600">S1</text><text x="324" y="40" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 01: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

El PLC repite su ciclo sin parar (cada 20 ms en estos proyectos): lee las entradas, ejecuta el programa de arriba abajo y escribe las salidas. En cada ciclo, `H1 := S1;` copia el estado del pulsador al piloto. No hay `if` ni espera: la salida sigue a la entrada mientras el programa corre.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar**: el Sim compila el proyecto con la misma cadena que el OpenPLC Editor.
2. En **Mandos** mantén apretado **S1**: `%IX0.0` se activa y H1 se enciende. Al soltarlo, se apaga.
3. Mira la pestaña **Programa**: en ST puedes cambiar el código ahí mismo; Ladder y FBD se abren en el OpenPLC Editor.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**H1 (Q0.0) encendido mientras S1 NO esté apretado, y S2 que manda H2 (Q0.1).**

1. Ejecuta el ejemplo y aprieta S1: H1 sigue al pulsador.
2. Invierte la lógica: H1 encendido con S1 suelto (NOT en ST, contacto cerrado en Ladder, bloque NOT en FBD).
3. Agrega lo que manda H2 con S2.
4. Prueba los dos pulsadores en el banco.

> [!TIP] Qué te llevas
> Una variable ubicada (AT %IX0.0) es una entrada de la placa; un contacto abierto deja pasar con la entrada activa y uno cerrado con la entrada inactiva.
