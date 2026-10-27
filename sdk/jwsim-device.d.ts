// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: MIT
// Contrato de los dispositivos de escena de JWPLC Sim (SDK, versión 1).
// Documentación: docs/SDK.md. Un dispositivo es un módulo ES que exporta por
// defecto un DeviceDefinition (o un arreglo de ellos).

/** Tiempo virtual en nanosegundos. */
export type Ns = bigint;

/** Tensión nominal: "24VDC", "230VAC", "12VDC"… */
export type Rating = `${number}V${"DC" | "AC"}`;

export interface ParameterSpec {
  id: string;
  label?: string;
  type: "string" | "number" | "boolean" | "enum";
  default: unknown;
  /** Solo para "enum". */
  options?: unknown[];
  unit?: string;
  hint?: string;
  /** Grupo del inspector ("01 Básicos"): los parámetros seguidos con el mismo grupo se muestran juntos. */
  group?: string;
}

/** Plantilla de taller: parámetros que la app aplica de una vez sobre los de fábrica. */
export interface PresetSpec {
  id: string;
  label: string;
  description?: string;
  params: Record<string, unknown>;
  /** Parámetros que la plantilla no toca (posición de una perilla); los demás vuelven a fábrica. */
  keep?: string[];
}

export interface TerminalSpec {
  /** Nombre del borne en el dispositivo ("A1", "13", "+V1"). En la escena: "<id>.<borne>". */
  id: string;
  label?: string;
}

export interface ActionSpec {
  id: string;
  label?: string;
  /**
   * momentary: activo mientras se mantiene; toggle: alterna; select: una de
   * `options`; value: un número entre `min` y `max` (p. ej. la distancia de
   * una pieza, que el símbolo arrastra con data-drag).
   */
  kind: "momentary" | "toggle" | "select" | "value";
  options?: (number | string)[];
  labels?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

/**
 * Fuente: marca su polo positivo (L+ / L) y su retorno (M / N). La red
 * trifásica ("AC3") no tiene pos/neg: marca cada fase y `volts` es la tensión
 * entre fases.
 */
export interface SourceSpec {
  /** "" si el dispositivo tiene una sola fuente. */
  id: string;
  pos?: string;
  neg?: string;
  kind: "DC" | "AC" | "AC3";
  volts: number;
  phases?: { L1: string; L2: string; L3: string };
  /**
   * Fuente controlada por el propio dispositivo (salida de un variador):
   * apagada salvo que DeviceStep.sources la encienda.
   */
  controlled?: boolean;
}

/** Estado de una fuente controlada en un instante. */
export interface SourceState {
  on: boolean;
  /** Frecuencia de salida (Hz): valor, pendiente (Hz/s) y objetivo de la rampa. */
  hz?: { value: number; rate: number; goal: number };
  /** Secuencia invertida (L2 y L3 cruzadas): el motor gira al revés. */
  reverse?: boolean;
}

/**
 * Carga trifásica (motor): la escena dice qué fase de la red llega a cada
 * borne y a qué nodo pertenece (dos bornes puenteados comparten nodo), y el
 * dispositivo deduce la conexión (estrella o triángulo) y la secuencia.
 */
export interface PhaseLoadSpec {
  id: string;
  terminals: string[];
}

/** Carga entre dos bornes: se energiza con un extremo en el positivo y el otro en el retorno de una misma fuente. */
export interface LoadSpec {
  id: string;
  a: string;
  b: string;
  rating: Rating | string;
  /** Polarizada (entrada sink, sensor, zumbador): `a` debe ir al positivo. */
  polar?: boolean;
  /** Bobina (para los avisos de "bobina sin alimentación"). */
  coil?: boolean;
}

export interface Electrical {
  sources?: SourceSpec[];
  loads?: LoadSpec[];
  /** Todos los contactos posibles: id → [borne, borne]. Cuáles están cerrados lo dice DeviceStep.contacts. */
  contacts?: Record<string, [string, string]>;
  phaseLoads?: PhaseLoadSpec[];
}

/** Enlace mecánico: activo mientras la salida `source` ("Y1.position") está en [min, max]. */
export interface LinkSpec {
  id: string;
  source: string;
  min: number;
  max: number;
}

/** Lectura numérica de la salida de otro dispositivo ("FER1.tMasa"). */
export interface ReadSpec {
  id: string;
  source: string;
}

/**
 * Sonda (elemento sensor) de un dispositivo: sus bornes y la salida que mide
 * (p. ej. la PT100 de un tanque: 3 bornes y tMasa). La lee el transmisor
 * cuyos bornes de entrada estén cableados a estos, uno con uno.
 */
export interface ProbeSpec {
  id: string;
  /** Tipo de sonda; solo la lee una entrada del mismo tipo ("pt100", "ph", "atc"). */
  kind: string;
  /** Bornes propios, en orden: el k-ésimo va al k-ésimo de la entrada. */
  terminals: string[];
  /** Salida del dispositivo con el valor medido. */
  output: string;
}

/**
 * Entrada de sonda de un transmisor. En update(), values[id] es el valor de
 * la sonda cableada o NaN si falta un cable, está cortado o los bornes no
 * coinciden (el transmisor la ve abierta).
 */
export interface ProbeInputSpec {
  id: string;
  kind: string;
  terminals: string[];
}

/** Esclavo Modbus RTU en el bus RS-485 de la placa (bornes A y B del dispositivo). */
export interface ModbusSpec {
  /** Dirección 1..247. */
  address: number;
  /** Velocidad en baudios; formato 8N1. Si el PLC usa otra, no responde. */
  baud: number;
  /** Demora entre el fin de la petición y la respuesta (ms). */
  responseMs?: number;
  /** Bornes del bus (por defecto "A" y "B"; el VFD-EL los llama SG+ y SG-). */
  a?: string;
  b?: string;
}

export interface LoadState {
  on: boolean;
  /** 1: `a` en el positivo; -1: invertida; 0: sin tensión. */
  polarity: 1 | -1 | 0;
  source: string | null;
  volts: number;
  kind: "DC" | "AC" | null;
  issue?: "overvoltage" | "undervoltage" | "polarity" | "damaged";
}

/** Estado de una carga trifásica: por borne, la fase (o null) y su nodo. */
export interface PhaseLoadState {
  terms: Record<string, { phase: "L1" | "L2" | "L3" | null; net: string }>;
  /** Tensión entre fases de la red que llega (0 si ninguna). */
  volts: number;
  /** Frecuencia de la fuente si la da un variador (null: red de 60 Hz). */
  hz?: { value: number; rate: number; goal: number } | null;
  /** Alimentada por una fuente controlada (variador): sigue su frecuencia. */
  controlled?: boolean;
  /** Quemada (falla inyectada o sobretensión): sin fases. */
  damaged?: boolean;
}

export interface DeviceInputs {
  /** Estado de cada carga declarada en electrical(). */
  loads: Record<string, LoadState>;
  /** Estado de cada carga trifásica declarada en electrical().phaseLoads. */
  phases?: Record<string, PhaseLoadState>;
  /** Enlaces mecánicos declarados en links(). */
  links: Record<string, boolean>;
  /** Lecturas numéricas declaradas en reads() (booleanos como 0/1) y sondas de probeInputs() (NaN: abierta). */
  values?: Record<string, number>;
  /** Acciones del usuario (pulsar, posición del selector). */
  actions: Record<string, number | boolean | string>;
  /** Señales de la placa simulada que el dispositivo declaró en signals.in. */
  signals: Record<string, number>;
  /** Bornes propios que tienen algún cable. */
  wired: Set<string>;
  /** La fuente propia está disparada (cortocircuito o cruce). */
  tripped: boolean;
  /** Lecturas de los sensores de corriente (id del sensor → borne → A). */
  currents?: Record<string, Record<string, number>>;
}

/** Segmento lineal: valor en el instante de update y pendiente en unidades por segundo. */
export interface Segment {
  value: number;
  rate: number;
}

export interface DeviceStep {
  /** Contactos cerrados (los que faltan quedan abiertos). */
  contacts?: Record<string, boolean>;
  /** Estado de las fuentes controladas (id de la fuente → estado). */
  sources?: Record<string, SourceState>;
  /** Salidas observables y mecánicas; las señales de signals.out van a la placa. */
  outputs?: Record<string, number | boolean | string | Segment>;
  /** Próximo evento propio (temporizador, fin de rampa). */
  nextEventNs?: Ns;
  /**
   * Parámetros que el propio equipo reprogramó (teclado, Modbus): la app los
   * guarda en la escena, como la memoria del equipo real.
   */
  params?: Record<string, unknown>;
  /** Corriente (A eficaces) que entra por cada borne propio (motores): la leen los sensores de corriente. */
  currents?: Record<string, number>;
}

/** Sensor de corriente: los bornes por los que mide (polos de un térmico, salida de un variador). */
export interface CurrentSensorSpec {
  id: string;
  terminals: string[];
}

export interface DeviceContext {
  /** Identificador en la escena ("KM1"). */
  id: string;
  /** Parámetros con los valores por defecto aplicados. */
  params: Record<string, any>;
}

export interface DeviceInstance {
  /**
   * Llamado en cada instante en que cambia algo de la escena o vence nextEventNs.
   * Debe ser idempotente para el mismo t y las mismas entradas: la escena lo
   * repite hasta el punto fijo. Sin reloj de pared ni aleatorios sin semilla.
   */
  update(t: Ns, inputs: DeviceInputs): DeviceStep | void;
  /**
   * Esclavo Modbus: registros desde `start` (tabla "holding" o "input") con el
   * estado del último update. undefined = no responde (sin alimentación);
   * null = dirección inexistente (excepción 02).
   */
  modbusRead?(table: "holding" | "input", start: number, count: number, t: Ns): number[] | null | undefined;
  /**
   * Escritura de registros; false = dirección inexistente (excepción 02); un
   * número = ese código de excepción (03: valor fuera de rango).
   */
  modbusWrite?(start: number, values: number[], t: Ns): boolean | number | undefined;
  /** Dirección, velocidad o demora que el equipo cambió en marcha (teclado); pisa a `modbus()`. */
  modbusConfig?(): Partial<ModbusSpec>;
}

export interface DeviceDefinition {
  /** "autor/nombre" en minúsculas: "jwsim/contactor", "acme/cinta". */
  type: string;
  /** Semver x.y.z. Un cambio de versión mayor rompe las escenas guardadas. */
  version: string;
  name: string;
  category?: string;
  description?: string;
  parameters?: ParameterSpec[];
  /** Plantillas de taller (configuraciones típicas) que el inspector ofrece. */
  presets?: PresetSpec[];
  terminals: TerminalSpec[];
  actions?: ActionSpec[];
  /** Señales de la placa: in = salidas del firmware que lee; out = entradas que maneja. */
  signals?: { in?: string[]; out?: string[] };
  links?(params: Record<string, any>): LinkSpec[];
  /** Lecturas numéricas de salidas de otros dispositivos. */
  reads?(params: Record<string, any>): ReadSpec[];
  /** Sondas propias que otro dispositivo puede leer por cable. */
  probes?(params: Record<string, any>): ProbeSpec[];
  /**
   * Sensores de corriente: en update(), inp.currents[id][borne] es la suma de
   * las corrientes que declaran las cargas aguas abajo de ese borne (sin
   * contar los contactos del propio dispositivo).
   */
  currentSensors?(params: Record<string, any>): CurrentSensorSpec[];
  /** Entradas de sonda: se leen por cable de la sonda de otro dispositivo. */
  probeInputs?(params: Record<string, any>): ProbeInputSpec[];
  /** Esclavo Modbus RTU en el bus RS-485 (bornes A y B). */
  modbus?(params: Record<string, any>): ModbusSpec;
  electrical?(params: Record<string, any>): Electrical;
  create(ctx: DeviceContext): DeviceInstance;
}
