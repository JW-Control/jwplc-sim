/*
 * SPDX-FileCopyrightText: 2026 JW Control
 * SPDX-License-Identifier: MIT
 *
 * ABI C de los dispositivos nativos de JWPLC Sim (SDK, versión 1).
 * Documentación: docs/SDK.md §3.
 *
 * Un dispositivo nativo es una biblioteca compartida (.so, .dll, .dylib) que
 * el runner carga con --device <archivo> [--device-params <json>]. Corre
 * dentro del runner, en tiempo virtual, conectado a las señales de la placa
 * (I0_x, Q0_x, BTN_*): sirve para lo que necesita precisión de bit (trenes
 * de pulsos, encoders), que el motor de escena en TypeScript no resuelve.
 *
 * Reglas:
 *   - Solo usa el host (jwsim_host): nada de reloj de pared, hilos ni
 *     aleatorios sin semilla. Así la corrida es determinista y se reproduce.
 *   - Los callbacks corren en el planificador del runner: no bloquean.
 *   - La biblioteca exporta jwsim_device_entry() con enlace C.
 */
#ifndef JWSIM_DEVICE_H
#define JWSIM_DEVICE_H

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

#define JWSIM_DEVICE_ABI 1

#if defined(_WIN32)
#define JWSIM_DEVICE_EXPORT __declspec(dllexport)
#else
#define JWSIM_DEVICE_EXPORT __attribute__((visibility("default")))
#endif

typedef uint64_t jwsim_device_ns;

/* Funciones que el runner ofrece al dispositivo. `ctx` se pasa de vuelta tal cual. */
typedef struct jwsim_host {
  uint32_t abi; /* JWSIM_DEVICE_ABI del runner */
  void *ctx;
  /* Tiempo virtual actual (ns). */
  jwsim_device_ns (*now)(void *ctx);
  /* Nivel de una señal de la placa: 0/1, o -1 si no existe. */
  int (*signal_get)(void *ctx, const char *name);
  /* Maneja una entrada de la placa (I0_x, BTN_*) en el instante actual,
   * como un estímulo. Devuelve 0 si se aceptó. */
  int (*signal_set)(void *ctx, const char *name, int level);
  /* Llama a fn(dev, t) en el instante virtual `at` (>= now). */
  void (*schedule)(void *ctx, jwsim_device_ns at, void (*fn)(void *dev, jwsim_device_ns t), void *dev);
  /* Mensaje a la consola del sistema ("[dispositivo tipo] ..."). */
  void (*log)(void *ctx, const char *msg);
} jwsim_host;

/* Descripción del dispositivo. */
typedef struct jwsim_device_desc {
  uint32_t abi;        /* JWSIM_DEVICE_ABI con que se compiló */
  const char *type;    /* "autor/nombre" */
  const char *version; /* semver "1.0.0" */
  const char *name;    /* nombre legible */
  /* Crea una instancia. params_json: objeto JSON plano ({} si no hay). NULL = error. */
  void *(*create)(const jwsim_host *host, const char *params_json);
  /* Señales que vigila, separadas por comas ("Q0_0,Q0_1"). Puede depender
   * de los parámetros: se consulta después de create. */
  const char *(*watch)(void *dev);
  /* Cambio de una señal vigilada, en el instante t. */
  void (*on_signal)(void *dev, const char *name, int level, jwsim_device_ns t);
  void (*destroy)(void *dev);
} jwsim_device_desc;

/* Punto de entrada que exporta la biblioteca. */
typedef const jwsim_device_desc *(*jwsim_device_entry_fn)(void);
#define JWSIM_DEVICE_ENTRY "jwsim_device_entry"

/* ------------------------------------------------------------------ */
/* Ayudas para leer parámetros de un JSON plano: {"hz": 50, "out": "I0_7"} */

static inline const char *jwsim_param__find(const char *json, const char *key) {
  size_t n = strlen(key);
  for (const char *p = json ? strchr(json, '"') : NULL; p; p = strchr(p + 1, '"')) {
    if (strncmp(p + 1, key, n) == 0 && p[n + 1] == '"') {
      const char *q = p + n + 2;
      while (*q == ' ' || *q == '\t') ++q;
      if (*q == ':') {
        ++q;
        while (*q == ' ' || *q == '\t') ++q;
        return q;
      }
    }
  }
  return NULL;
}

/* Número del parámetro `key`, o `def` si no está. */
static inline double jwsim_param_num(const char *json, const char *key, double def) {
  const char *v = jwsim_param__find(json, key);
  if (!v) return def;
  if (*v == '"') ++v;
  char *end = NULL;
  double d = strtod(v, &end);
  return end == v ? def : d;
}

/* Cadena del parámetro `key` en buf (sin escapes), o `def`. */
static inline const char *jwsim_param_str(const char *json, const char *key, char *buf, size_t n, const char *def) {
  const char *v = jwsim_param__find(json, key);
  if (!v || *v != '"' || n == 0) return def;
  size_t i = 0;
  for (++v; *v && *v != '"' && i + 1 < n; ++v) buf[i++] = *v;
  buf[i] = 0;
  return buf;
}

#ifdef __cplusplus
}
#endif

#endif /* JWSIM_DEVICE_H */
