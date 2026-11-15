# Propuesta: JWPLC Sim con Open Industry Project (planta 3D)

Propuesta del 12/11/2026, por aprobar. Open Industry Project (OIP) es un
simulador de plantas 3D de código abierto (licencia MIT, hecho en Godot) que
se conecta a PLC reales o simulados por Modbus TCP, OPC UA o EtherNet/IP.
La idea: **JWPLC Sim pone el PLC y el tablero eléctrico, OIP pone la planta
en 3D** (cintas, cajas, cilindros, tanques), conectados en vivo.

## 1. Lo que ya hay (G8, `docs/integration/OIP_FUXA.md`)

Un puente Modbus TCP (`app/lib/io-bridge.mjs`, `127.0.0.1:5020`) que
publica la **bornera** del JWPLC Basic: OIP escribe las entradas I0.0-I0.7
(sensores) y lee las salidas Q0.0-Q0.7 (actuadores). Probado con FUXA real;
**falta la prueba de taller con OIP** (criterio C4 de `JWSIM_G8_OIP_FUXA`).

Límites: solo 8 entradas y 8 salidas digitales, y salta el tablero: la
cinta de OIP se mueve con Q0.0 aunque en el esquema no haya contactor, ni
variador, ni protección.

## 2. Propuesta en tres etapas

### Etapa 1 · Cerrar G8 con OIP real (corta)

- Instalar la versión actual de OIP y verificar su panel de comunicaciones
  (Modbus TCP por libplctag: tags `co`, `di`, `hr`, `ir`).
- Planta de prueba: cinta con fotocelda y desviador, con el sketch de
  marcha/parada. Registrar en `docs/reports/G8_OIP_REAL.md`.
- Resultado: `JWSIM_G8_OIP_FUXA` en PASS.

### Etapa 2 · Puente de escena (el tablero manda la planta)

Publicar por Modbus TCP **las salidas y acciones de los equipos de la
escena**, no la bornera. Así la planta 3D se mueve por lo que pasa en el
tablero eléctrico, con su cableado y sus fallas:

| De JWPLC Sim a OIP (lee OIP) | De OIP a JWPLC Sim (escribe OIP) |
|---|---|
| `KM1.closed` → cinta en marcha | fotocelda de OIP → `B1` (acción del sensor) |
| `VF1` frecuencia (registro) → velocidad de la cinta | fin de carrera de OIP → `B2` |
| `Y1.position` → cilindro | caja en la báscula → entrada de un transmisor |
| `T1.nivel` → nivel del tanque 3D | consumo de la planta → `T1.consumo` |

- **Tabla de tags en el proyecto** (`.jwsim`, `simulation.plantBridge`):
  nombre, `dispositivo.salida` o `dispositivo.acción`, sentido, tipo (bit o
  registro con escala) y dirección. La app la propone sola a partir de la
  escena (cada equipo de planta y cada sensor enlazado) y se edita en una
  pestaña «Planta 3D / OIP».
- Reutiliza el servidor Modbus TCP del puente actual y la escena
  (`scene.act`, salidas de los equipos); el puente de la bornera sigue
  igual.
- Un sensor manejado por OIP deja de usar su enlace interno (como hoy una
  entrada cableada en la escena no la escribe el puente).
- Prueba automática: un cliente Modbus que hace lo de OIP (como el gate
  G8 actual) y una prueba de taller con OIP.

### Etapa 3 · Exportar la planta a OIP (la planta 3D «a posteriori»)

Generar desde la escena un proyecto de OIP listo para abrir: por cada
equipo de planta, la pieza de OIP equivalente con su tamaño y sus tags ya
puestos.

| JWPLC Sim | OIP |
|---|---|
| Cinta (`conveyor`: largo, velocidad, sensores A y B) | cinta con dos fotoceldas |
| Tanque (`tank`: forma, capacidad, alto) | tanque con la geometría del modelo (cilindro, tolva, prisma…) |
| Puerta, cilindro (electroválvula) | puerta, cilindro neumático |

- Las formas del tanque y sus medidas ya están en la escena (tanque 1.1):
  la exportación las usa directamente.
- Botón «Abrir en OIP» que genera el proyecto y lanza OIP (ruta configurable).

## 3. Decisiones a tomar

1. **Quién calcula la física.** Propuesta: JWPLC Sim calcula el tablero y
   los procesos que ya modela (tanque, fermentador); OIP, lo mecánico
   (cajas, cintas, colisiones). Un mismo equipo no se calcula en los dos.
2. **Tiempo.** OIP corre en tiempo real: con OIP conectado la simulación va
   a ×1 (la velocidad ×10 queda solo sin OIP).
3. **Protocolo.** Modbus TCP para empezar (ya está hecho y probado); OPC UA
   como mejora si hace falta nombrar los tags en vez de usar direcciones.
4. **Licencias.** OIP es MIT: se puede documentar y lanzar desde la app;
   no se redistribuye dentro del instalador sin revisar sus dependencias.

## 4. Riesgos

- La interfaz de comunicaciones de OIP cambia entre versiones: fijar la
  versión probada en la guía.
- Latencia: el gate G8 mide ≤ 42 ms de entrada a salida; con OIP en otra
  PC depende de la red.
- Las piezas de OIP no tienen todas las formas del tanque: algunas habrá
  que modelarlas (Godot) o aproximarlas.

## 5. Orden sugerido

Etapa 1 (validar con OIP real) → etapa 2 (puente de escena, el mayor
valor para enseñar: la planta responde al tablero) → etapa 3 (exportar).
