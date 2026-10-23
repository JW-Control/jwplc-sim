/*
 * SPDX-FileCopyrightText: 2026 Autor
 * SPDX-License-Identifier: MIT
 *
 * Plantilla de dispositivo nativo (SDK de JWPLC Sim, docs/SDK.md §3).
 * Copia la salida `from` a la entrada `to` con `delay_us` de retardo.
 * Parámetros: {"from": "Q0_0", "to": "I0_0", "delay_us": 500}
 *
 * Compilar: jwsim-cli device build .
 * Usar:     <sketch> --device build/devices/mi-dispositivo-nativo/mi-dispositivo-nativo.so --device-params '{...}'
 */
#include <stdio.h>
#include <stdlib.h>

#include "jwsim_device.h"

typedef struct {
  const jwsim_host *host;
  char from[16];
  char to[16];
  jwsim_device_ns delay;
} dev_t_;

typedef struct {
  dev_t_ *d;
  int level;
} pending;

static void apply(void *arg, jwsim_device_ns t) {
  pending *p = (pending *)arg;
  (void)t;
  p->d->host->signal_set(p->d->host->ctx, p->d->to, p->level);
  free(p);
}

static void *create(const jwsim_host *host, const char *params) {
  dev_t_ *d = (dev_t_ *)calloc(1, sizeof *d);
  if (!d) return NULL;
  d->host = host;
  if (!jwsim_param_str(params, "from", d->from, sizeof d->from, NULL)) snprintf(d->from, sizeof d->from, "Q0_0");
  if (!jwsim_param_str(params, "to", d->to, sizeof d->to, NULL)) snprintf(d->to, sizeof d->to, "I0_0");
  d->delay = (jwsim_device_ns)(jwsim_param_num(params, "delay_us", 500) * 1000.0);
  return d;
}

static const char *watch(void *dev) { return ((dev_t_ *)dev)->from; }

static void on_signal(void *dev, const char *name, int level, jwsim_device_ns t) {
  dev_t_ *d = (dev_t_ *)dev;
  pending *p = (pending *)malloc(sizeof *p);
  (void)name;
  if (!p) return;
  p->d = d;
  p->level = level;
  d->host->schedule(d->host->ctx, t + d->delay, apply, p);
}

static void destroy(void *dev) { free(dev); }

static const jwsim_device_desc DESC = {
    JWSIM_DEVICE_ABI, "autor/mi-dispositivo-nativo", "0.1.0", "Mi dispositivo nativo", create, watch, on_signal, destroy,
};

JWSIM_DEVICE_EXPORT const jwsim_device_desc *jwsim_device_entry(void) { return &DESC; }
