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

/** Fuente: marca su polo positivo (L+ / L) y su retorno (M / N). */
export interface SourceSpec {
  /** "" si el dispositivo tiene una sola fuente. */
  id: string;
  pos: string;
  neg: string;
  kind: "DC" | "AC";
  volts: number;
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
}

/** Enlace mecánico: activo mientras la salida `source` ("Y1.position") está en [min, max]. */
export interface LinkSpec {
  id: string;
  source: string;
  min: number;
  max: number;
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

export interface DeviceInputs {
  /** Estado de cada carga declarada en electrical(). */
  loads: Record<string, LoadState>;
  /** Enlaces mecánicos declarados en links(). */
  links: Record<string, boolean>;
  /** Acciones del usuario (pulsar, posición del selector). */
  actions: Record<string, number | boolean | string>;
  /** Señales de la placa simulada que el dispositivo declaró en signals.in. */
  signals: Record<string, number>;
  /** Bornes propios que tienen algún cable. */
  wired: Set<string>;
  /** La fuente propia está disparada (cortocircuito o cruce). */
  tripped: boolean;
}

/** Segmento lineal: valor en el instante de update y pendiente en unidades por segundo. */
export interface Segment {
  value: number;
  rate: number;
}

export interface DeviceStep {
  /** Contactos cerrados (los que faltan quedan abiertos). */
  contacts?: Record<string, boolean>;
  /** Salidas observables y mecánicas; las señales de signals.out van a la placa. */
  outputs?: Record<string, number | boolean | string | Segment>;
  /** Próximo evento propio (temporizador, fin de rampa). */
  nextEventNs?: Ns;
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
  terminals: TerminalSpec[];
  actions?: ActionSpec[];
  /** Señales de la placa: in = salidas del firmware que lee; out = entradas que maneja. */
  signals?: { in?: string[]; out?: string[] };
  links?(params: Record<string, any>): LinkSpec[];
  electrical?(params: Record<string, any>): Electrical;
  create(ctx: DeviceContext): DeviceInstance;
}
