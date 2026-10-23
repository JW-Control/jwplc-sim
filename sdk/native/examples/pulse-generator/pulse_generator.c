/*
 * SPDX-FileCopyrightText: 2026 JW Control
 * SPDX-License-Identifier: MIT
 *
 * Dispositivo nativo de ejemplo (SDK G7): generador de pulsos, como un
 * encoder o un caudalímetro. Mientras la señal `enable` está en 1, la
 * entrada `output` alterna a `hz` pulsos por segundo (ciclo del 50 %), con
 * flancos exactos en tiempo virtual.
 *
 * Parámetros: {"enable": "Q0_0", "output": "I0_7", "hz": 50}
 *
 *   jwsim-cli device build sdk/native/examples/pulse-generator
 *   <sketch> --device build/devices/pulse-generator/pulse-generator.so \
 *            --device-params '{"hz": 100}'
 */
#include <stdio.h>
#include <stdlib.h>

#include "jwsim_device.h"

typedef struct {
  const jwsim_host *host;
  char enable[16];
  char output[16];
  char watch[16];
  jwsim_device_ns half_period;
  int running;
  int level;
  unsigned generation; /* invalida los temporizadores al detener */
} pulse_gen;

typedef struct {
  pulse_gen *g;
  unsigned generation;
} tick_arg;

static void tick(void *arg, jwsim_device_ns t) {
  tick_arg *a = (tick_arg *)arg;
  pulse_gen *g = a->g;
  if (!g->running || a->generation != g->generation) {
    free(a);
    return;
  }
  g->level = !g->level;
  g->host->signal_set(g->host->ctx, g->output, g->level);
  g->host->schedule(g->host->ctx, t + g->half_period, tick, a);
}

static void *create(const jwsim_host *host, const char *params) {
  pulse_gen *g = (pulse_gen *)calloc(1, sizeof *g);
  if (!g) return NULL;
  g->host = host;
  jwsim_param_str(params, "enable", g->enable, sizeof g->enable, "Q0_0");
  if (g->enable[0] == 0) snprintf(g->enable, sizeof g->enable, "Q0_0");
  jwsim_param_str(params, "output", g->output, sizeof g->output, "I0_7");
  if (g->output[0] == 0) snprintf(g->output, sizeof g->output, "I0_7");
  const double hz = jwsim_param_num(params, "hz", 50.0);
  if (!(hz > 0.0 && hz <= 100000.0)) {
    host->log(host->ctx, "hz debe estar entre 0 y 100000");
    free(g);
    return NULL;
  }
  g->half_period = (jwsim_device_ns)(5e8 / hz + 0.5);
  snprintf(g->watch, sizeof g->watch, "%s", g->enable);
  return g;
}

static const char *watch(void *dev) { return ((pulse_gen *)dev)->watch; }

static void on_signal(void *dev, const char *name, int level, jwsim_device_ns t) {
  pulse_gen *g = (pulse_gen *)dev;
  (void)name;
  if (level && !g->running) {
    g->running = 1;
    tick_arg *a = (tick_arg *)malloc(sizeof *a);
    a->g = g;
    a->generation = ++g->generation;
    /* Primer flanco medio período después de habilitar. */
    g->host->schedule(g->host->ctx, t + g->half_period, tick, a);
  } else if (!level && g->running) {
    g->running = 0;
    ++g->generation;
    if (g->level) {
      g->level = 0;
      g->host->signal_set(g->host->ctx, g->output, 0);
    }
  }
}

static void destroy(void *dev) { free(dev); }

static const jwsim_device_desc DESC = {
    JWSIM_DEVICE_ABI, "jwcontrol/pulse-generator", "1.0.0", "Generador de pulsos", create, watch, on_signal, destroy,
};

JWSIM_DEVICE_EXPORT const jwsim_device_desc *jwsim_device_entry(void) { return &DESC; }
