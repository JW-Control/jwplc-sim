<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-5/17-servidor-modbus-tcp-la-pc-mira-y-manda.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 17: Servidor Modbus TCP: la PC mira y manda

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 47 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-8/47-servidor-modbus-tcp/)

Una banda cuenta cajas y el jefe de producción quiere verlas desde la oficina, y arrancar la banda sin bajar al tablero. El JWPLC y la PC están en la misma red Ethernet; el idioma común es **Modbus TCP**. En la ruta C++ es la lección 47; aquí el servidor se configura en el **OpenPLC Editor** y el programa solo usa variables.

## Qué vas a aprender

- A agregar el servidor Modbus TCP a un proyecto del OpenPLC Editor y darle al JWPLC una IP fija.
- Qué tabla de Modbus es cada dirección IEC: %QX son bobinas y %MW son holding.
- A leer lo que escribe la PC y a escribir lo que la PC lee, con variables comunes.

## El servidor, en el proyecto

En el OpenPLC Editor, el servidor Modbus no se programa: se configura. En **Servers** se agrega un servidor **Modbus** con transporte **TCP** (puerto 502) y, en su *Buffer Mapping*, cuántos **%MW** expone como holding. En **Device → Network** se activa la red con IP fija **192.168.250.10**, máscara 255.255.255.0 y puerta de enlace 192.168.250.1. Al subir el programa, el JWPLC atiende el puerto 502 por su cuenta.

## Cada dirección IEC es una tabla de Modbus

| En el programa | En Modbus | Dirección para la PC |
|---|---|---|
| `%IX0.0` a `%IX0.7` (entradas) | Entradas discretas | 10001 a 10008 |
| `%QX0.0` a `%QX0.7` (salidas) | Bobinas | 00001 a 00008 |
| `%MW0`, `%MW1`… (memoria) | Holding | 40001, 40002… |

Las variables **%MW** no son bornes: son palabras de memoria que existen para que la red las lea y las escriba. Si el programa no usa salidas analógicas (%QW), el **%MW0** es el holding 40001.

## El mapa de la banda

```iecst
VAR
  CAJAS  AT %MW0 : INT;  (* 40001: cajas contadas *)
  MARCHA AT %MW1 : INT;  (* 40002: marcha, la escribe la PC *)
END_VAR
```

La PC lee el 40001 cuando quiere y escribe el 40002 para arrancar la banda. KM1 (%QX0.0) es además la bobina 00001: la PC ve la banda en marcha sin que el programa haga nada más.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    B1 AT %IX0.0   : BOOL; (* sensor de cajas *)
    KM1 AT %QX0.0  : BOOL; (* banda (bobina 00001 para la PC) *)
    CAJAS AT %MW0  : INT; (* holding 40001: cajas contadas *)
    MARCHA AT %MW1 : INT; (* holding 40002: marcha, la escribe la PC *)
    META AT %MW2   : INT; (* holding 40003: meta de cajas, la escribe la PC *)
    F_CAJA         : R_TRIG;
  END_VAR

  (* Cada caja que pasa frente a B1 suma una (flanco de subida). *)
  F_CAJA(CLK := B1);
  IF F_CAJA.Q THEN
    CAJAS := CAJAS + 1;
  END_IF;

  (* La banda marcha mientras la PC tenga un valor distinto de 0 en el 40002. *)
  KM1 := MARCHA <> 0;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 622 412" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 622px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 26)"><path stroke-width="3" d="M1.5 -8V160M608.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M347 50H608.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M347 90H377"/><rect data-sig="I0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 232)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 26)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Una caja más (40001) &#42;)</text><text x="80" y="54" text-anchor="middle" font-size="9">P</text><text x="80" y="32" text-anchor="middle" font-weight="600">B1</text><text x="302" y="27" text-anchor="middle" font-weight="700">ADD</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="261" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="343" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="343" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">CAJAS</text><text x="223" y="134" text-anchor="end" font-weight="600">1</text><text x="381" y="94" text-anchor="start" font-weight="600">CAJAS</text></g><g transform="translate(6 232)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; La banda: marcha desde la PC (40002 distinto de 0) &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">NE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">MARCHA</text><text x="109" y="134" text-anchor="end" font-weight="600">0</text><text x="267" y="94" text-anchor="start" font-weight="600">KM1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 17, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 14 736 550" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 736px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M134 82H210"/><path d="M282 82H420"/><path d="M134 194H210"/><path d="M134 242H210"/><path d="M-56 322H20"/><path d="M-56 370H20"/><path d="M104 322H157V290H210"/><path d="M294 194H420"/><path d="M134 482H210"/><path d="M134 530H210"/><path d="M294 482H420"/><rect x="210" y="34" width="72" height="72" rx="2"/><rect x="22" y="66" width="128" height="32" rx="16"/><rect x="420" y="66" width="128" height="32" rx="16"/><rect x="210" y="146" width="84" height="168" rx="2"/><rect x="22" y="178" width="128" height="32" rx="16"/><rect x="22" y="226" width="128" height="32" rx="16"/><rect x="20" y="274" width="84" height="120" rx="2"/><rect x="-168" y="306" width="128" height="32" rx="16"/><rect x="-168" y="354" width="128" height="32" rx="16"/><rect x="420" y="178" width="128" height="32" rx="16"/><rect x="210" y="434" width="84" height="120" rx="2"/><rect x="22" y="466" width="128" height="32" rx="16"/><rect x="22" y="514" width="128" height="32" rx="16"/><rect x="420" y="466" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="246" y="47" text-anchor="middle" font-weight="700">R&#95;TRIG</text><text x="246" y="29" text-anchor="middle" font-style="italic" opacity="0.8">F&#95;CAJA</text><text x="214" y="85.5" text-anchor="start" font-size="9">CLK</text><text x="278" y="85.5" text-anchor="end" font-size="9">Q</text><text x="86" y="86" text-anchor="middle" font-weight="600">B1</text><text x="484" y="86" text-anchor="middle" font-weight="600">CAJA</text><text x="252" y="159" text-anchor="middle" font-weight="700">SEL</text><text x="214" y="197.5" text-anchor="start" font-size="9">G</text><text x="214" y="245.5" text-anchor="start" font-size="9">IN0</text><text x="214" y="293.5" text-anchor="start" font-size="9">IN1</text><text x="290" y="197.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="198" text-anchor="middle" font-weight="600">CAJA</text><text x="86" y="246" text-anchor="middle" font-weight="600">CAJAS</text><text x="62" y="287" text-anchor="middle" font-weight="700">ADD</text><text x="24" y="325.5" text-anchor="start" font-size="9">IN1</text><text x="24" y="373.5" text-anchor="start" font-size="9">IN2</text><text x="100" y="325.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="326" text-anchor="middle" font-weight="600">CAJAS</text><text x="-104" y="374" text-anchor="middle" font-weight="600">1</text><text x="484" y="198" text-anchor="middle" font-weight="600">CAJAS</text><text x="252" y="447" text-anchor="middle" font-weight="700">NE</text><text x="214" y="485.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="533.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="485.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="486" text-anchor="middle" font-weight="600">MARCHA</text><text x="86" y="534" text-anchor="middle" font-weight="600">0</text><text x="484" y="486" text-anchor="middle" font-weight="600">KM1</text></g></svg>
<figcaption>FBD de la lección 17: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

El flanco de B1 suma una caja en `CAJAS` (como en la lección 14). La banda sigue a la orden de la PC: `KM1 := MARCHA <> 0;`. En Ladder, la suma es un bloque **ADD** detrás de un contacto de flanco y la comparación un bloque **NE** por EN/ENO; en FBD, **R_TRIG**, **SEL** con **ADD**, y **NE**. Nada en el programa habla de la red: el servidor del proyecto presta `CAJAS` y `MARCHA` tal cual.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y espera unos segundos: la PC **PC1** del **Esquema** dice «en línea».
2. Arrastra a la derecha el valor del **40002** en la PC: **KM1** cierra y la bobina **00001** se enciende.
3. Acciona el sensor **B1** desde su símbolo: el **40001** cuenta las cajas.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Meta desde la PC: la PC escribe la meta de cajas en el 40003; al llegarla, el programa pone la marcha (40002) en 0 y la banda para sola.**

1. Ejecuta el ejemplo y espera «en línea» en la PC PC1: el 40001 cuenta las cajas y la bobina 00001 muestra la banda.
2. Arrastra el 40002 de la PC a un valor distinto de 0: la banda KM1 arranca. Acciona B1 y mira sumar el 40001.
3. Declara META AT %MW2 (40003). Si META > 0 y CAJAS >= META, escribe 0 en MARCHA: la banda para y la PC lo ve.

> [!TIP] Qué te llevas
> Con el servidor Modbus TCP del proyecto, las variables %MW son los holding que la PC lee y escribe; el programa también puede escribir en ellos, como borrar la marcha al cumplir la meta.
