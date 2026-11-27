<!-- Copia de la wiki (wiki/curso-iec-61131/unidad-4/15-contar-el-tiempo-un-horometro-con-mantenimiento.mdx). Se edita en la wiki y se trae con: node scripts/importar-wiki-curso.mjs -->

# Lección 15: Contar el tiempo: un horómetro con mantenimiento

**Ruta IEC 61131-3** · **Tiempo:** unos 20 minutos · **Banco:** el mismo de la [lección 17 en C++](https://jw-control.com/wiki/curso-jwplc-basic/unidad-3/17-mensajes-para-el-operador/)

Los motores, compresores y bombas se mantienen por **horas de marcha**: cambio de aceite cada 500 h, rodamientos cada 2 000 h. El PLC lleva la cuenta con un **horómetro**, un número que sube mientras el equipo trabaja. En el Sim se cuenta en segundos para no esperar horas.

## Qué vas a aprender

- Un generador de pulsos: un TON que se reinicia con su propia salida.
- A acumular tiempo en un INT sumando pulsos.
- A usar ese número en comparaciones: aviso y bloqueo de mantenimiento.

## Un pulso por segundo

```pascal
T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
PULSO := T_SEG.Q;
```

Con el motor en marcha, el TON cuenta 1 s y pone PULSO en TRUE. En la vuelta siguiente, `NOT PULSO` corta su entrada: el TON vuelve a cero y empieza otro segundo. PULSO dura **una sola vuelta**, justo lo que hace falta para sumar uno.

## Sumar los pulsos

```pascal
IF PULSO THEN
  SEGUNDOS := SEGUNDOS + 1;
END_IF;
```

Con el motor parado no hay pulsos y el horómetro se queda quieto: cuenta solo tiempo de marcha.

## El programa

El mismo programa en los tres lenguajes. Elige el que vas a usar: el Sim califica igual cualquiera de los tres.

#### ST

```pascal title="main.st"
PROGRAM main
  VAR
    S1 AT %IX0.0  : BOOL; (* marcha, NA *)
    S2 AT %IX0.1  : BOOL; (* paro, NC: TRUE sin pulsar *)
    KM1 AT %QX0.0 : BOOL; (* motor *)
    H1 AT %QX0.1  : BOOL; (* mantenimiento *)
    T_SEG         : TON;
    PULSO         : BOOL; (* TRUE una vuelta por segundo de marcha *)
    SEGUNDOS      : INT; (* horómetro: segundos de marcha *)
  END_VAR

  (* Marcha y parada con enclavamiento. *)
  KM1 := (KM1 OR S1) AND S2;

  (* Un pulso por segundo de marcha: el TON se reinicia solo con su propia salida. *)
  T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
  PULSO := T_SEG.Q;

  (* El horómetro suma un segundo por pulso. *)
  IF PULSO THEN
    SEGUNDOS := SEGUNDOS + 1;
  END_IF;

  (* Mantenimiento a los 20 s de marcha (en una planta serían horas). *)
  H1 := SEGUNDOS >= 20;

END_PROGRAM
```

#### Ladder

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 755 768" role="img" aria-label="Programa Ladder" style="width: 100%; height: auto; max-width: 755px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><g transform="translate(6 10)"><path stroke-width="3" d="M1.5 8V160M443.5 8V160"/><path d="M214 50H304"/><path d="M332 50H443.5"/><path d="M3 50H23"/><path d="M27 50H72"/><path d="M96 50H141"/><path d="M25 51V142H72"/><path d="M96 142H143V51"/><path d="M145 50H190"/><rect data-sig="I0_0" x="69" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M72 50H79M79 40V60M89 40V60M89 50H96"/><rect data-sig="Q0_0" x="69" y="129" width="30" height="26" rx="4" stroke="none"/><path d="M72 142H79M79 132V152M89 132V152M89 142H96"/><rect data-sig="I0_1" x="187" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M190 50H197M197 40V60M207 40V60M207 50H214"/><rect data-sig="Q0_0" x="301" y="37" width="34" height="26" rx="4" stroke="none"/><path d="M304 50H310M326 50H332"/><path d="M314 40Q308 50 314 60M322 40Q328 50 322 60"/></g><g transform="translate(6 216)"><path stroke-width="3" d="M1.5 -8V120M741.5 -8V120"/><path d="M3 50H68"/><path d="M92 50H182"/><path d="M206 50H371"/><path d="M437 50H602"/><path d="M630 50H741.5"/><path d="M341 90H371"/><rect data-sig="Q0_0" x="65" y="37" width="30" height="26" rx="4" stroke="none"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><path d="M182 50H189M189 40V60M199 40V60M199 50H206"/><path d="M191 58L197 42"/><rect x="371" y="14" width="66" height="100" rx="2"/><path d="M602 50H608M624 50H630"/><path d="M612 40Q606 50 612 60M620 40Q626 50 620 60"/></g><g transform="translate(6 382)"><path stroke-width="3" d="M1.5 -8V160M608.5 -8V160"/><path d="M3 50H68"/><path d="M92 50H257"/><path d="M347 50H608.5"/><path d="M227 90H257"/><path d="M227 130H257"/><path d="M347 90H377"/><path d="M68 50H75M75 40V60M85 40V60M85 50H92"/><rect x="257" y="14" width="90" height="140" rx="2"/></g><g transform="translate(6 588)"><path stroke-width="3" d="M1.5 -8V160M494.5 -8V160"/><path d="M3 50H143"/><path d="M233 50H494.5"/><path d="M113 90H143"/><path d="M113 130H143"/><path d="M233 90H263"/><rect x="143" y="14" width="90" height="140" rx="2"/></g></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><g transform="translate(6 10)"><text x="0" y="2" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Marcha y parada con enclavamiento &#42;)</text><text x="84" y="32" text-anchor="middle" font-weight="600">S1</text><text x="84" y="124" text-anchor="middle" font-weight="600">KM1</text><text x="202" y="32" text-anchor="middle" font-weight="600">S2</text><text x="318" y="32" text-anchor="middle" font-weight="600">KM1</text></g><g transform="translate(6 216)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Un pulso por segundo de marcha &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">KM1</text><text x="194" y="32" text-anchor="middle" font-weight="600">PULSO</text><text x="404" y="27" text-anchor="middle" font-weight="700">TON</text><text x="404" y="9" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;SEG</text><text x="375" y="53.5" text-anchor="start" font-size="9">IN</text><text x="375" y="93.5" text-anchor="start" font-size="9">PT</text><text x="433" y="53.5" text-anchor="end" font-size="9">Q</text><text x="433" y="93.5" text-anchor="end" font-size="9">ET</text><text x="616" y="32" text-anchor="middle" font-weight="600">PULSO</text><text x="337" y="94" text-anchor="end" font-weight="600">T#1s</text></g><g transform="translate(6 382)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Horómetro: un segundo más por pulso &#42;)</text><text x="80" y="32" text-anchor="middle" font-weight="600">PULSO</text><text x="302" y="27" text-anchor="middle" font-weight="700">ADD</text><text x="261" y="53.5" text-anchor="start" font-size="9">EN</text><text x="261" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="261" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="343" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="343" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="223" y="94" text-anchor="end" font-weight="600">SEGUNDOS</text><text x="223" y="134" text-anchor="end" font-weight="600">1</text><text x="381" y="94" text-anchor="start" font-weight="600">SEGUNDOS</text></g><g transform="translate(6 588)"><text x="0" y="-14" text-anchor="start" font-style="italic" opacity="0.75">(&#42; Mantenimiento a los 20 s &#42;)</text><text x="188" y="27" text-anchor="middle" font-weight="700">GE</text><text x="147" y="53.5" text-anchor="start" font-size="9">EN</text><text x="147" y="93.5" text-anchor="start" font-size="9">IN1</text><text x="147" y="133.5" text-anchor="start" font-size="9">IN2</text><text x="229" y="53.5" text-anchor="end" font-size="9">ENO</text><text x="229" y="93.5" text-anchor="end" font-size="9">OUT</text><text x="109" y="94" text-anchor="end" font-weight="600">SEGUNDOS</text><text x="109" y="134" text-anchor="end" font-weight="600">20</text><text x="267" y="94" text-anchor="start" font-weight="600">H1</text></g></g></svg>
<figcaption>Ladder (LD) de la lección 15, como se ve en el OpenPLC Editor.</figcaption>
</figure>

#### FBD

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-178 0 926 900" role="img" aria-label="Programa FBD" style="width: 100%; height: auto; max-width: 926px; color: var(--sl-color-white, currentColor);"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M134 68H210"/><path d="M134 116H210"/><path d="M294 68H400"/><path d="M324 172H362V116H400"/><path d="M484 68H610"/><path d="M134 290H210"/><path d="M-56 370H20"/><path d="M92 370H151V338H210"/><path d="M294 290H400"/><path d="M324 426H362V338H400"/><path d="M460 290H610"/><path d="M324 530H400"/><path d="M324 578H400"/><path d="M134 658H210"/><path d="M134 706H210"/><path d="M294 658H347V626H400"/><path d="M484 530H610"/><path d="M324 818H400"/><path d="M324 866H400"/><path d="M484 818H610"/><rect x="400" y="20" width="84" height="120" rx="2"/><rect x="210" y="20" width="84" height="120" rx="2"/><rect x="22" y="52" width="128" height="32" rx="16"/><rect x="22" y="100" width="128" height="32" rx="16"/><rect x="212" y="156" width="128" height="32" rx="16"/><rect x="610" y="52" width="128" height="32" rx="16"/><rect x="400" y="242" width="60" height="120" rx="2"/><rect x="210" y="242" width="84" height="120" rx="2"/><rect x="22" y="274" width="128" height="32" rx="16"/><rect x="20" y="322" width="72" height="72" rx="2"/><rect x="-168" y="354" width="128" height="32" rx="16"/><rect x="212" y="410" width="128" height="32" rx="16"/><rect x="610" y="274" width="128" height="32" rx="16"/><rect x="400" y="482" width="84" height="168" rx="2"/><rect x="212" y="514" width="128" height="32" rx="16"/><rect x="212" y="562" width="128" height="32" rx="16"/><rect x="210" y="610" width="84" height="120" rx="2"/><rect x="22" y="642" width="128" height="32" rx="16"/><rect x="22" y="690" width="128" height="32" rx="16"/><rect x="610" y="514" width="128" height="32" rx="16"/><rect x="400" y="770" width="84" height="120" rx="2"/><rect x="212" y="802" width="128" height="32" rx="16"/><rect x="212" y="850" width="128" height="32" rx="16"/><rect x="610" y="802" width="128" height="32" rx="16"/></g><g fill="currentColor" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11"><text x="442" y="33" text-anchor="middle" font-weight="700">AND</text><text x="404" y="71.5" text-anchor="start" font-size="9">IN1</text><text x="404" y="119.5" text-anchor="start" font-size="9">IN2</text><text x="480" y="71.5" text-anchor="end" font-size="9">OUT</text><text x="252" y="33" text-anchor="middle" font-weight="700">OR</text><text x="214" y="71.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="119.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="71.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="72" text-anchor="middle" font-weight="600">KM1</text><text x="86" y="120" text-anchor="middle" font-weight="600">S1</text><text x="276" y="176" text-anchor="middle" font-weight="600">S2</text><text x="674" y="72" text-anchor="middle" font-weight="600">KM1</text><text x="430" y="255" text-anchor="middle" font-weight="700">TON</text><text x="430" y="237" text-anchor="middle" font-style="italic" opacity="0.8">T&#95;SEG</text><text x="404" y="293.5" text-anchor="start" font-size="9">IN</text><text x="404" y="341.5" text-anchor="start" font-size="9">PT</text><text x="456" y="293.5" text-anchor="end" font-size="9">Q</text><text x="456" y="341.5" text-anchor="end" font-size="9">ET</text><text x="252" y="255" text-anchor="middle" font-weight="700">AND</text><text x="214" y="293.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="341.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="293.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="294" text-anchor="middle" font-weight="600">KM1</text><text x="56" y="335" text-anchor="middle" font-weight="700">NOT</text><text x="24" y="373.5" text-anchor="start" font-size="9">IN</text><text x="88" y="373.5" text-anchor="end" font-size="9">OUT</text><text x="-104" y="374" text-anchor="middle" font-weight="600">PULSO</text><text x="276" y="430" text-anchor="middle" font-weight="600">T#1s</text><text x="674" y="294" text-anchor="middle" font-weight="600">PULSO</text><text x="442" y="495" text-anchor="middle" font-weight="700">SEL</text><text x="404" y="533.5" text-anchor="start" font-size="9">G</text><text x="404" y="581.5" text-anchor="start" font-size="9">IN0</text><text x="404" y="629.5" text-anchor="start" font-size="9">IN1</text><text x="480" y="533.5" text-anchor="end" font-size="9">OUT</text><text x="276" y="534" text-anchor="middle" font-weight="600">PULSO</text><text x="276" y="582" text-anchor="middle" font-weight="600">SEGUNDOS</text><text x="252" y="623" text-anchor="middle" font-weight="700">ADD</text><text x="214" y="661.5" text-anchor="start" font-size="9">IN1</text><text x="214" y="709.5" text-anchor="start" font-size="9">IN2</text><text x="290" y="661.5" text-anchor="end" font-size="9">OUT</text><text x="86" y="662" text-anchor="middle" font-weight="600">SEGUNDOS</text><text x="86" y="710" text-anchor="middle" font-weight="600">1</text><text x="674" y="534" text-anchor="middle" font-weight="600">SEGUNDOS</text><text x="442" y="783" text-anchor="middle" font-weight="700">GE</text><text x="404" y="821.5" text-anchor="start" font-size="9">IN1</text><text x="404" y="869.5" text-anchor="start" font-size="9">IN2</text><text x="480" y="821.5" text-anchor="end" font-size="9">OUT</text><text x="276" y="822" text-anchor="middle" font-weight="600">SEGUNDOS</text><text x="276" y="870" text-anchor="middle" font-weight="600">20</text><text x="674" y="822" text-anchor="middle" font-weight="600">H1</text></g></svg>
<figcaption>FBD de la lección 15: entradas a la izquierda, bloques al centro y salidas a la derecha.</figcaption>
</figure>

## Cómo funciona el programa

El ejemplo enciende H1 (mantenimiento) a los 20 s. En una planta, el aviso llega antes de que haga falta parar, para programar el trabajo, y el bloqueo llega después, si nadie lo hizo. La práctica arma las dos cosas con dos comparaciones sobre el mismo número: `>= 10` avisa y `< 20` deja marchar al motor. En Ladder, el bloqueo es un contacto más en el peldaño de la marcha, alimentado por un bloque LT.

## Pruébalo en JWPLC Sim

1. Pulsa **Ejecutar** y aprieta **S1**: el motor marcha.
2. Mira **SEGUNDOS** en las variables en vivo: sube uno por segundo.
3. A los 20 s, H1 (mantenimiento) se enciende.
4. Abre la práctica desde **Inicio → Ruta de aprendizaje** y elige el lenguaje: **ST** se edita ahí mismo en el Sim; **Ladder** y **FBD** se editan en el OpenPLC Editor (Archivo → Abrir proyecto, con la carpeta que muestra la consola del Sim). Al guardar en el editor, el Sim recompila solo.

## Para practicar

**Aviso de mantenimiento H1 a los 10 s de marcha y, a los 20 s, el motor se detiene y no vuelve a arrancar.**

1. Ejecuta el ejemplo: con S1 el motor marcha y SEGUNDOS sube uno por segundo (míralo en las variables en vivo).
2. Adelanta el aviso H1 a los 10 s.
3. Agrega el bloqueo: el motor marcha solo mientras SEGUNDOS < 20.
4. Pasados los 20 s, S1 ya no lo arranca.

> [!TIP] Qué te llevas
> Un TON que se reinicia con su propia salida da un pulso por segundo; sumar esos pulsos convierte el tiempo en un número que se puede comparar, como un horómetro.
