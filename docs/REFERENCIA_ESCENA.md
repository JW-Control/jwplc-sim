# Referencia de dispositivos de escena (`jwsim-cli scene describe`)

> Archivo generado automáticamente desde `scene/devices/` y los símbolos `.svg` reales mediante `node scripts/gen-scene-ref.mjs`.
> No editar a mano.

Total de tipos integrados: **65** · Grilla obligatoria: **20 px**.

## Controladores

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/jwplc-basic` | `plc` | 460×540 | `24VDC`, `M0`, `M1`, `I0_0`, `I0_1`, `I0_2`, `I0_3`, `I0_4`, `I0_5`, `I0_6`, `I0_7`, `RS485_GND`, `RS485_A`, `RS485_B`, `RS485_SHIELD`, `USB`, `Q0_0.1`, `Q0_0.2`, `Q0_1.1`, `Q0_1.2`, `Q0_2.1`, `Q0_2.2`, `Q0_3.1`, `Q0_3.2`, `Q0_4.1`, `Q0_4.2`, `Q0_5.1`, `Q0_5.2`, `Q0_6.1`, `Q0_6.2`, `Q0_7.1`, `Q0_7.2` | salidas: powered | Controlador JWPLC Basic: 8 entradas sink de 24 VDC (común M1) y 8 salidas a relé con bornera propia. Corre el firmware del proyecto. |
| `jwsim/remote-io` | `KF` | 280×360 | `+`, `-`, `A`, `B`, `DC`, `DI1`, `DI2`, `DI3`, `DI4`, `DI5`, `DI6`, `DI7`, `DI8`, `C1`, `DO1`, `DO2`, `DO3`, `DO4`, `C2`, `DO5`, `DO6`, `DO7`, `DO8` | salidas: powered, salidas, entradas, do1, di1, do2… | Módulo de E/S remotas Modbus RTU de riel DIN, 8 entradas de 24 VDC (DI1-DI8, común DC al 0 V) y 8 salidas a relé (DO1-DO4 con el común C1... |

## Alimentación

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/power-24vdc` | `PS` | 160×360 | `+V1`, `+V2`, `-V1`, `-V2`, `DCOK1`, `DCOK2`, `PE`, `N`, `L` | var: por defecto, model=HDR-60, model=NDR-120<br>salidas: on | Fuente de riel DIN de 24 VDC (modelos MDR-60, HDR-60 o NDR-120) con protección contra cortocircuito (dispara y se rearma desde la escena)... |
| `jwsim/power-230vac` | `L` | 160×360 | `L`, `N` | salidas: on | Alimentación monofásica de 230 VAC (fase L y neutro N) con interruptor automático. |
| `jwsim/power-3ph` | `Q` | 240×360 | `L1`, `L2`, `L3` | salidas: on | Red trifásica de 220 V entre fases, 60 Hz (L1, L2, L3), con interruptor automático tripolar. Dos fases unidas son un cortocircuito y la p... |

## Mando

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/pushbutton-no` | `S` | 160×240 | `13`, `14` | salidas: pressed | Pulsador de 22 mm con contactos 13-14 NA: cambian mientras se mantiene pulsado. |
| `jwsim/pushbutton-nc` | `S` | 160×240 | `11`, `12` | salidas: pressed | Pulsador de 22 mm con contactos 11-12 NC: cambian mientras se mantiene pulsado. |
| `jwsim/pushbutton-nono` | `S` | 160×240 | `13`, `14`, `23`, `24` | salidas: pressed | Pulsador de 22 mm con contactos 13-14 NA y 23-24 NA: cambian mientras se mantiene pulsado. |
| `jwsim/pushbutton-nonc` | `S` | 160×240 | `13`, `14`, `21`, `22` | salidas: pressed | Pulsador de 22 mm con contactos 13-14 NA y 21-22 NC: cambian mientras se mantiene pulsado. |
| `jwsim/pushbutton-lit` | `S` | 160×240 | `13`, `14`, `X1`, `X2` | salidas: pressed, lit | Pulsador luminoso de 22 mm con LED incorporado: 13-14 NA mientras se pulsa y el piloto X1-X2 independiente, que se enciende con su tensió... |
| `jwsim/emergency-stop` | `S` | 160×240 | `11`, `12`, `23`, `24` | salidas: pressed | Pulsador de parada de emergencia tipo hongo Ø40 mm, de enclavamiento: al pulsarlo queda enclavado y se suelta girándolo. 11-12 NC abre y ... |
| `jwsim/selector-2` | `SA` | 160×240 | `13`, `14`, `21`, `22` | salidas: position | Selector 0-I: 13-14 cierra en I y 21-22 cierra en 0. Con retorno por resorte vuelve a 0 al soltar. |
| `jwsim/selector-3` | `SA` | 160×240 | `13`, `14`, `23`, `24` | salidas: position | Selector I-0-II: 13-14 cierra en I y 23-24 en II; en 0 ambos abiertos. |
| `jwsim/selector-key` | `SA` | 160×240 | `13`, `14`, `21`, `22` | salidas: position | Selector de llave de 2 posiciones 0-I: 13-14 cierra en I y 21-22 en 0. La llave solo se retira en 0, por eso se usa para habilitar modos ... |
| `jwsim/potentiometer` | `RP` | 160×240 | `1`, `2`, `3` | salidas: ratio, pos, dial | Potenciómetro lineal de 5 kΩ para montaje en panel (22 mm) con perilla graduada 0 a 10. Bornes 1 y 3 en los extremos y 2 en el cursor; gi... |

## Sensores

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/limit-switch` | `B` | 120×240 | `13`, `14`, `21`, `22` | var: por defecto, model=compacto<br>enlaces: source<br>salidas: actuated | Interruptor de posición con contacto NA (13-14) y NC (21-22). Se acciona a mano o por la posición de otro dispositivo (p. ej. Y1.position... |
| `jwsim/sensor-inductive` | `B` | 620×260 | `BN`, `BU`, `BK` | enlaces: source<br>salidas: detecting, output, powered, distance, sn, snTxt | Sensor inductivo de 3 hilos M18 ( detecta metal a Sn = 8 mm sobre acero, histéresis 10 %). Otros metales acortan el alcance (latón 50 %, ... |
| `jwsim/sensor-capacitive` | `B` | 620×260 | `BN`, `BU`, `BK` | enlaces: source<br>salidas: detecting, output, powered, distance, sn, snTxt | Sensor capacitivo de 3 hilos M18 de plástico ( Sn ajustable hasta 8 mm, histéresis 20 %). Detecta metales y no metales: agua y metal al 1... |
| `jwsim/sensor-photoelectric` | `B` | 100×100 | `BN`, `BU`, `BK` | enlaces: source<br>salidas: detecting, output, powered | Sensor fotoeléctrico difuso de 3 hilos. Se acciona a mano o por la posición de otro dispositivo. |
| `jwsim/sensor-cylinder` | `B` | 100×100 | `BN`, `BU`, `BK` | enlaces: cylinder<br>salidas: detecting, output, powered | Final de carrera magnético de 3 hilos (PNP) montado en la ranura del cilindro: detecta el imán del émbolo en el extremo elegido. Indique ... |
| `jwsim/float-switch` | `BL` | 160×300 | `BK`, `BN`, `BU` | enlaces: source<br>salidas: up | Interruptor de nivel de flotador tipo pera con cable de 3 hilos: BK común, BN cierra con el flotador arriba (nivel alto) y BU con el flot... |
| `jwsim/level-electrodes` | `BL` | 160×320 | `E1`, `E2`, `E3` | enlaces: source<br>salidas: mojadas, wet1, wet2, nivel | Porta-electrodos de 3 varillas para el relé de nivel: E3 de referencia (la más larga, al fondo del tanque), E2 de nivel bajo y E1 de nive... |
| `jwsim/pressure-switch` | `BP` | 160×300 | `1`, `2`, `4` | enlaces: source<br>salidas: activado, presion, texto, ajusteTxt | Presostato de diferencial ajustable (-0,2 a 7,5 bar) con contacto conmutado: al subir la presión hasta Corte cierra 1-4 y abre 1-2; vuelv... |
| `jwsim/thermostat` | `BT` | 160×300 | `1`, `2`, `4` | enlaces: source<br>salidas: activado, temperatura, texto, ajusteTxt | Termostato de bulbo y capilar con diferencial ajustable (20 a 60 °C) y contacto conmutado: al subir la temperatura hasta Corte cierra 1-4... |
| `jwsim/chlorine-rs485` | `BCL` | 200×260 | `+`, `-`, `A`, `B` | enlaces: source<br>salidas: powered, cloro, ph, celda | Analizador amperométrico de cloro libre (0-5 mg/L) con celda de flujo y salida RS-485 Modbus RTU, 24 VDC. De fábrica: dirección 4, 9600 b... |
| `jwsim/pressure-rs485` | `BP` | 200×260 | `+`, `-`, `A`, `B` | enlaces: source<br>salidas: powered, presion, sensor, raw | Transmisor de presión piezorresistivo de 0 a 10 bar (rosca G1/4) con salida RS-485 Modbus RTU, 12-30 VDC. De fábrica: dirección 1, 9600 b... |
| `jwsim/pt100-rs485` | `BT` | 260×200 | `B`, `A`, `-`, `+`, `R3`, `R1`, `R2` | salidas: powered, temp, sonda, raw | Transmisor de temperatura de cabezal (Form B, Ø44 mm) para PT100 de 3 hilos (R1, R2 rojos; R3 blanco) con salida RS-485 Modbus RTU, 12-35... |
| `jwsim/ph-rs485` | `BPH` | 120×120 | `+`, `-`, `A`, `B`, `PH`, `REF`, `T1`, `T2` | salidas: powered, ph, temp, sonda | Transmisor de pH con compensación de temperatura (ATC), salida RS-485 Modbus RTU, 24 VDC. Electrodo en PH (BNC) y REF; sensor de temperat... |

## Señalización

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/lamp` | `H` | 160×240 | `X1`, `X2` | var: por defecto, model=AD16<br>salidas: lit | Piloto luminoso de 22 mm (X1-X2): metálico XB2 o monobloque AD16. Se enciende con su tensión nominal; con más tensión se quema. |
| `jwsim/stack-light` | `H` | 120×360 | `COM`, `R`, `A`, `V`, `Z` | salidas: red, amber, green, buzzer | Torre de señalización LED de 3 niveles con zumbador (tipo LTA-205-3, Ø50 mm): rojo (falla), ámbar (aviso) y verde (en marcha), cada uno e... |
| `jwsim/buzzer` | `HA` | 160×200 | `+`, `-` | salidas: sounding | Zumbador de 24 VDC polarizado (+/-). |

## Maniobra

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/relay` | `K` | 120×140 | `11`, `12`, `14`, `21`, `22`, `24`, `A1`, `A2` | salidas: energized, closed | Relé enchufable con dos contactos conmutados (11-12-14 y 21-22-24), con tiempos de atraque y caída. |
| `jwsim/timer-relay` | `KT` | 120×360 | `15`, `16`, `18`, `25`, `26`, `28`, `A1`, `A2` | salidas: energized, closed, closed1, closed2, timing, progress… | Relé temporizador multifunción de riel DIN, bobina A1-A2 y dos contactos conmutados 15-16-18 y 25-26-28. Modos: retardo a la conexión (ci... |
| `jwsim/contactor` | `KM` | 240×360 | `1`, `2`, `3`, `4`, `5`, `6`, `13`, `14`, `A1`, `A2` | var: por defecto, aux=01<br>salidas: energized, closed | Contactor de 3 polos (1-2, 3-4, 5-6) con un contacto auxiliar incorporado: 13-14 NA (aux 10) o 21-22 NC (aux 01). |
| `jwsim/ssr` | `K` | 160×240 | `1`, `2`, `3`, `4` | salidas: on, input | Relé de estado sólido Fotek SSR-40DA: entrada 3-32 VDC en 3 (+) y 4 (−), salida 24-380 VAC 40 A en 1-2, sin contactos móviles (conmuta en... |
| `jwsim/level-relay` | `KL` | 120×360 | `11`, `12`, `14`, `A1`, `E1`, `E2`, `A2`, `E3` | salidas: energized, closed, nivel | Relé de control de nivel para líquidos conductores: alimentación A1-A2, electrodos E1 (alto), E2 (bajo) y E3 (referencia) y un conmutado ... |

## Actuadores

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/solenoid-valve` | `Y` | 520×220 | `A1`, `A2` | salidas: energized, position, extended, retracted | Electroválvula 5/2 monoestable (retorno por resorte) con cilindro de doble efecto. position va de 0 (adentro) a 1 (afuera) en el tiempo d... |
| `jwsim/solenoid-valve-2` | `Y` | 520×220 | `A+1`, `A+2`, `A-1`, `A-2` | salidas: coilPlus, coilMinus, spoolA, position, extended, retracted | Electroválvula 5/2 de doble solenoide (con memoria) y cilindro de doble efecto. Un pulso en A+ (A+1/A+2) pasa la corredera a P→A y el cil... |
| `jwsim/chlorinator` | `CL` | 200×300 | `A1`, `A2` | enlaces: agua<br>salidas: cloro, dosificando, marcha, tanque, sinCaudal | Bomba dosificadora de diafragma con tanque de hipoclorito de sodio, bobina de 24 VDC en A1-A2 (marcha mientras está energizada). Inyecta ... |
| `jwsim/motor` | `M` | 220×200 | `U1`, `U2` | salidas: energized, speed, running, direction | Motor monofásico de 230 VAC o de 24 VDC (U1-U2). speed va de -1 a 1 con rampa de arranque y de parada; en CC el sentido sigue a la polari... |
| `jwsim/motor-1ph` | `M` | 320×260 | `U1`, `U2`, `PE` | var: por defecto, bornera=4 cables<br>salidas: energized, bloqueado, corriente, speed, running, direction… | Motor monofásico de 220 V con capacitor de arranque (1 HP, 1720 rpm): bobinado principal U1-U2 y auxiliar Z1-Z2 con el capacitor. El auxi... |
| `jwsim/motor-3ph` | `M` | 320×260 | `U1`, `V1`, `W1`, `PE` | var: por defecto, bornera=6 cables<br>salidas: energized, connection, faltaFase, speed, running, direction… | Motor de inducción trifásico 220Δ/380Y. La bornera (U1 V1 W1 / W2 U2 V2) se arma con chapas en triángulo (la conexión de la red de 220 V)... |
| `jwsim/motor-2v` | `M` | 320×260 | `1U`, `1V`, `1W`, `2U`, `2V`, `2W`, `PE` | salidas: energized, corriente, velocidad, conflicto, faltaFase, speed… | Motor trifásico de 220 V con dos bobinados independientes, como el de lavado y centrifugado de la JWPLC Laundry: 1U 1V 1W para la velocid... |
| `jwsim/vfd-el` | `VF` | 640×700 | `R`, `S`, `PE`, `U`, `V`, `W`, `RA`, `RB`, `RC`, `+24V`, `MI2`, `MI1`, `MI4`, `MI3`, `MI6`, `MI5`, `DCM`, `+10V`, `AVI`, `ACM`, `SG+`, `SG-` | salidas: powered, running, hz, fRef, corriente, avi… | Variador de frecuencia de 0,75 kW (estructura A: entrada monofásica 220 V en R/L1-S/L2, salida trifásica 220 V en U/T1 V/T2 W/T3, 0,75 kW... |
| `jwsim/water-valve` | `YV` | 120×120 | `A1`, `A2` | salidas: energized, open | Electroválvula 2/2 para agua, normalmente cerrada (NC) o abierta (NA). Bobina A1-A2. Salidas: energized, open. |

## Neumática

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/compressor` | `C` | 360×240 | `L`, `N` | salidas: pressure, running, powered, consumers | Compresor de pistón con tanque y presostato: arranca cuando la presión baja a la de arranque y para al llegar a la de corte. Los cilindro... |
| `jwsim/service-unit` | `UM` | 200×280 | *(sin bornes)* | enlaces: source<br>salidas: pressure, inlet | Filtro-regulador con manómetro: entrega a los cilindros la presión regulada, o la del compresor si es menor. Sin compresor indicado entre... |

## Planta

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/building-water` | `RED` | 360×400 | *(sin bornes)* | enlaces: bombas, cisterna<br>salidas: presion, qBombas, qConsumo, consumo, reposicion, seco… | Montante y red de un edificio con tanque hidroneumático. Las bombas (motores de la escena en «Bombas», p. ej. M1, M2) succionan de la cis... |
| `jwsim/lift` | `ASC` | 300×520 | *(sin bornes)* | enlaces: motor<br>salidas: altura, piso, enPiso, pisoTxt, puerta0, puerta1… | Cabina de montacargas en su pozo, movida por un motor de la escena (parámetro Motor, p. ej. M1.speed: positivo sube). altura es la del pi... |
| `jwsim/sand-filter` | `FIL` | 320×420 | *(sin bornes)* | enlaces: bomba<br>salidas: dp, qServicio, qRetrolavado, qRel, colmatacion, turbidez… | Filtro a presión de arena y antracita. Lo alimenta la bomba de captación (parámetro Bomba, p. ej. M1.speed) y lo gobiernan dos válvulas: ... |
| `jwsim/conveyor` | `CV` | 280×120 | *(sin bornes)* | enlaces: motor<br>salidas: sensorA, sensorB, piezas, avance, salidas, enCinta | Cinta de rodillos movida por un motor de la escena (parámetro Motor, p. ej. M1.speed: la velocidad del motor de -1 a 1). Las piezas se po... |
| `jwsim/conveyor-physics` | `CV` | 280×120 | *(sin bornes)* | enlaces: motor<br>salidas: sensorA, sensorB, piezas, velPiezas, avance, salidas… | Cinta movida por un motor de la escena (Motor, p. ej. M1.speed de -1 a 1) en la que las cajas tienen masa y fricción: la siguen al arranc... |
| `jwsim/tank` | `T` | 200×220 | *(sin bornes)* | enlaces: bomba, extraccion, valvula<br>salidas: nivel, nivelPct, alturaM, volumenL, caudalEntrada, caudalSalida… | Tanque con modelo de balance de volumen discretizado. Forma (cilindro vertical u horizontal, rectangular, cono, prisma en V, cuarto de cí... |
| `jwsim/door` | `P` | 260×160 | *(sin bornes)* | enlaces: motor<br>salidas: posicion, posicionPct, abierta, cerrada, forzando, persona | Puerta corrediza movida por un motor de la escena (parámetro Motor, p. ej. M1.speed: positivo abre, negativo cierra). La posición (P1.pos... |

## Protección

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/overload-relay` | `F` | 240×300 | `1`, `2`, `3`, `4`, `5`, `6`, `95`, `96`, `97`, `98` | salidas: tripped, faltaFase, sobrecarga, corriente, calor, test… | Relé de sobrecarga térmico tripolar (clase 10A, IEC 60947-4-1) que se monta bajo el contactor: polos 1-2, 3-4 y 5-6, contactos 95-96 NC (... |
| `jwsim/breaker` | `Q` | 80×360 | `1`, `2` | var: por defecto, poles=2P, poles=3P<br>salidas: on, tripped, corriente, calor, rating | Interruptor termomagnético (IEC 60898-1) de 1, 2 o 3 polos: entrada 1/3/5 arriba y salida 2/4/6 abajo. Mide la corriente de la salida: di... |
| `jwsim/motor-protector` | `QM` | 320×360 | `1`, `2`, `3`, `4`, `5`, `6`, `13`, `14`, `21`, `22` | salidas: on, tripped, knob, faltaFase, corriente, calor… | Guardamotor (disyuntor de motor) con contacto auxiliar 13-14 / 21-22: polos 1-2, 3-4 y 5-6 con protección térmica de clase 10 ajustable (... |

## Instrumentación

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/signal-source` | `CAL` | 200×300 | `+`, `-` | salidas: valor, senal, texto | Calibrador de lazo portátil que genera una señal de 4-20 mA (fuente de corriente, como un transmisor de 2 hilos con su fuente) o de 0-10 ... |
| `jwsim/voltmeter` | `PV` | 120×200 | `1`, `2` | salidas: volts, lcd, texto, on | Voltímetro digital de 22 mm tipo piloto (AD16-22FS, 60-500 VAC, o AD16-22DSV, 6-100 VDC) con display de 3 dígitos: mide la tensión entre ... |
| `jwsim/ammeter` | `PA` | 120×200 | `1`, `2` | salidas: amps, lcd, texto | Amperímetro digital de 22 mm tipo piloto con transformador de corriente incorporado (AD16-22FSA, 0-100 A): el conductor de la carga pasa ... |
| `jwsim/energy-meter` | `PM` | 240×360 | `CT1`, `CT2`, `L`, `N`, `A`, `B` | salidas: powered, volts, amps, watts, kwh, alarma… | Medidor de energía monofásico (80-260 VAC, 100 A con TC) con RS-485 Modbus RTU: se alimenta de la tensión que mide (L-N) y la fase de la ... |
| `jwsim/temp-controller` | `TC` | 200×300 | `11`, `14`, `21`, `24`, `L`, `N`, `A`, `B`, `R1`, `R2`, `R3` | salidas: powered, pv, sv, salida, alarma, pvTxt… | Controlador de temperatura de panel 48 × 48 mm con RS-485 Modbus RTU, entrada PT100 de 3 hilos (R1, R2, R3) y control ON-OFF con histéres... |

## Comunicación

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/usb-rs485` | `TF` | 120×360 | `A`, `B`, `GND` | salidas: com, eco | Conversor USB a RS-485 tipo ZK-U485 (CH340G + MAX485, semidúplex, alimentado por el USB): une el bus RS-485 del JWPLC con un puerto COM d... |
| `jwsim/usb-pc` | `XD` | 160×160 | `USB` | salidas: com | Cable USB del puerto USB-C del JWPLC a la PC: el Monitor serie (UART0, Serial) queda en el puerto COM del parámetro, como con la placa re... |

## Proceso

| Tipo | Prefijo | Tamaño | Bornes | Variantes / Enlaces | Descripción corta |
|---|---|---|---|---|---|
| `jwsim/fermentador` | `FER` | 920×620 | `Y1_A1`, `Y1_A2`, `M1_U1`, `M1_U2`, `M2_U1`, `M2_U2`, `FS_C`, `FS_NO`, `TT_R1`, `TT_R2`, `TT_R3`, `AT_PH`, `AT_REF`, `AT_T1`, `AT_T2` | salidas: tMasa, tMosto, ph, tTerma, serpentin, valvula… | Bloque de planta: fermentador de café con serpentín de agua caliente (terma solar), electroválvula Y1, bomba de retorno M1, bomba de most... |
