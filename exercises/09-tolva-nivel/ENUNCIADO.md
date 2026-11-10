# Ejercicio 9 · Nivel de una tolva con descarga por gravedad

**Nivel 3.** Una tolva cónica de 10 L entrega agua al proceso por gravedad y una bomba la vuelve a llenar. Dos sensores capacitivos detectan el agua a través de la pared de la tolva.

Como la tolva es angosta abajo y ancha arriba, el nivel **no sube parejo**: con poca agua sube muy rápido y cerca del borde, despacio. Y como descarga por gravedad, sale más agua cuando la tolva está llena que cuando está casi vacía. Observe el tanque **T1** en el esquema eléctrico mientras corre la simulación.

## Escena

El tablero ya está cableado. Solo hay que programar el JWPLC Basic.

| Señal | Equipo | Función |
|---|---|---|
| I0_0 | B1, sensor capacitivo al 30 % de la altura | Detecta: hay agua a la altura de B1 |
| I0_1 | B2, sensor capacitivo al 80 % de la altura | Detecta: tolva llena |
| I0_2 | S1, selector «Habilitar» | En I: el proceso está habilitado |
| Q0_0 | KM1, contactor | Bomba M1 (230 VAC) |
| Q0_1 | Y1, electroválvula de descarga | Abierta: la tolva entrega agua al proceso |
| Q0_2 | H1, piloto rojo | Nivel bajo |

## Qué debe hacer el programa

1. Con **S1 en 0** todo queda detenido: bomba parada y descarga cerrada.
2. Con **S1 en I** se abre la descarga **Y1**.
3. Con S1 en I, cuando el agua baja de **B1** la bomba arranca. Sigue funcionando aunque el agua pase B1 y **para recién al llegar a B2**. Entre los dos niveles mantiene lo que venía haciendo (histéresis).
4. Si S1 vuelve a 0 con la bomba en marcha, la bomba para y la descarga se cierra en ese momento.
5. El piloto **H1** está encendido mientras el agua esté por debajo de B1, con S1 en cualquier posición.

## Para pensar

- ¿Por qué la tolva tarda unos 18 s en llenarse del 10 % al 80 % y casi dos minutos en bajar del 80 % al 30 %?
- Cambie en **T1** la forma a «cilindro vertical» (la ficha del equipo o sus propiedades) y compare los tiempos con la misma capacidad.

## Cómo se califica

`node cli/jwsim-cli.mjs grade exercises/09-tolva-nivel` (o el botón **Calificar** de la app) corre su programa con la escena en varios casos y comprueba el estado de las salidas y de los equipos en ventanas de tiempo. La nota va de 0 a 20; el detalle dice qué verificación falló y cuándo.
