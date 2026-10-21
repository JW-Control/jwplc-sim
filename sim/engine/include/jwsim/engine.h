// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: MIT
// JWPLC Sim — API C del motor determinista.
//
// El motor es el dueño del tiempo virtual. Todo el firmware (sketch, librerías
// del package, core JWPLC) corre en "tareas" cooperativas (fibras) sobre un
// único hilo del sistema operativo. Solo se cambia de tarea en puntos de
// sincronización: llamadas al HAL simulado que consumen tiempo, esperas o
// primitivas FreeRTOS. Con las mismas entradas, la ejecución es idéntica.
//
// Unidades: nanosegundos virtuales (uint64).
#ifndef JWSIM_ENGINE_H
#define JWSIM_ENGINE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef uint64_t jwsim_ns_t;

#define JWSIM_NS_PER_US 1000ULL
#define JWSIM_NS_PER_MS 1000000ULL
#define JWSIM_NS_FOREVER UINT64_MAX

// Configuración fija del ESP32 simulado.
#define JWSIM_NUM_CORES 2
#define JWSIM_TICK_HZ 1000u                 // configTICK_RATE_HZ de arduino-esp32
#define JWSIM_TICK_NS (1000000000ULL / JWSIM_TICK_HZ)
#define JWSIM_MAX_PRIORITIES 25             // configMAX_PRIORITIES de ESP-IDF
#define JWSIM_CORE_ANY (-1)

typedef struct jwsim_task jwsim_task;
typedef struct jwsim_waitq jwsim_waitq;

// ---------------------------------------------------------------- tiempo
// Tiempo del núcleo que ejecuta la tarea actual (o el mínimo global fuera de
// una tarea).
jwsim_ns_t jwsim_now(void);
uint32_t jwsim_tick_count(void);

// Consume tiempo de CPU en el núcleo actual (la tarea sigue "corriendo").
// Es un punto de sincronización: puede producir una apropiación por una tarea
// de mayor prioridad o ceder al otro núcleo.
void jwsim_cpu(jwsim_ns_t ns);

// Bloquea la tarea actual durante ns (p. ej. esperando una transacción de bus);
// otras tareas del mismo núcleo pueden correr mientras tanto.
void jwsim_wait(jwsim_ns_t ns);

// ---------------------------------------------------------------- tareas
typedef void (*jwsim_task_fn)(void *arg);

jwsim_task *jwsim_task_create(jwsim_task_fn fn, void *arg, const char *name,
                              size_t stack_bytes, unsigned priority, int core);
void jwsim_task_delete(jwsim_task *task);        // NULL = la tarea actual
jwsim_task *jwsim_task_self(void);
const char *jwsim_task_name(const jwsim_task *task);
unsigned jwsim_task_priority(const jwsim_task *task);
void jwsim_task_set_priority(jwsim_task *task, unsigned priority);
int jwsim_task_core(const jwsim_task *task);
int jwsim_current_core(void);
void jwsim_task_suspend(jwsim_task *task);
void jwsim_task_resume(jwsim_task *task);

// Bloquea hasta el tick absoluto indicado (semántica vTaskDelay/DelayUntil).
void jwsim_task_sleep_until_tick(uint32_t tick);
void jwsim_task_yield(void);

// Suspende la conmutación de tareas (vTaskSuspendAll). Anidable.
void jwsim_sched_lock(void);
void jwsim_sched_unlock(void);

// Notificaciones directas a tarea (xTaskNotify*/ulTaskNotifyTake).
bool jwsim_task_notify_wait(uint32_t *value_out, uint32_t clear_on_entry,
                            uint32_t clear_on_exit, jwsim_ns_t timeout_ns);
void jwsim_task_notify(jwsim_task *task, uint32_t value, int action, uint32_t *prev);

// ---------------------------------------------------------------- espera
// Cola de espera genérica para construir semáforos, colas y mutex.
jwsim_waitq *jwsim_waitq_new(void);
void jwsim_waitq_free(jwsim_waitq *q);
// Bloquea la tarea actual en q. Devuelve true si fue despertada por
// jwsim_waitq_wake_one/all y false si venció el timeout.
bool jwsim_waitq_block(jwsim_waitq *q, jwsim_ns_t timeout_ns);
// Despierta a la tarea de mayor prioridad (FIFO entre iguales). Devuelve true
// si despertó a alguna.
bool jwsim_waitq_wake_one(jwsim_waitq *q);
void jwsim_waitq_wake_all(jwsim_waitq *q);
bool jwsim_waitq_empty(const jwsim_waitq *q);

// ---------------------------------------------------------------- ejecución
typedef struct jwsim_run_limits {
  jwsim_ns_t until_ns;        // detener cuando todos los núcleos superan este tiempo
} jwsim_run_limits;

typedef enum jwsim_stop_reason {
  JWSIM_STOP_TIME = 0,        // se alcanzó until_ns
  JWSIM_STOP_IDLE = 1,        // ninguna tarea puede volver a correr
  JWSIM_STOP_REQUEST = 2,     // jwsim_request_stop()
} jwsim_stop_reason;

// Ejecuta el planificador hasta el límite. Puede llamarse repetidamente para
// avanzar por tramos (pausa = simplemente no llamar: el tiempo queda congelado).
jwsim_stop_reason jwsim_run(const jwsim_run_limits *limits);
void jwsim_request_stop(void);

// Eventos externos temporizados (estímulos, modelos de dispositivos). El
// callback corre en el contexto del planificador en el instante indicado,
// antes de que cualquier núcleo lo sobrepase.
typedef void (*jwsim_event_fn)(void *arg, jwsim_ns_t when);
void jwsim_schedule_event(jwsim_ns_t when, jwsim_event_fn fn, void *arg);

// ---------------------------------------------------------------- costos
// Modelo de costos de CPU (ns virtuales) de operaciones del HAL. Configurable
// para calibrarlo contra mediciones en hardware real (gate G1).
typedef struct jwsim_cost_model {
  jwsim_ns_t task_yield;      // taskYIELD()/yield() y una vuelta de loopTask
  jwsim_ns_t gpio_access;     // digitalRead/digitalWrite de GPIO nativo
  jwsim_ns_t millis_call;     // millis()/micros()
  jwsim_ns_t hal_call;        // llamada genérica al HAL
  jwsim_ns_t sem_op;          // operación de semáforo/mutex sin bloqueo
} jwsim_cost_model;

jwsim_cost_model *jwsim_costs(void);

// ---------------------------------------------------------------- traza
// Traza determinista: cada evento observable (cambio de pin, transacción de
// bus, salida de consola) se agrega a un hash FNV-1a de 64 bits. Dos corridas
// con el mismo hash produjeron la misma historia observable.
void jwsim_trace_bytes(const void *data, size_t len);
void jwsim_trace_u64(uint64_t v);
uint64_t jwsim_trace_hash(void);
uint64_t jwsim_trace_count(void);

// Estadísticas por tarea (CPU virtual y despachos) para --stats.
#include <stdio.h>
void jwsim_print_task_stats(FILE *out);

// Fallo irrecuperable del simulador (no del firmware simulado).
void jwsim_fatal(const char *fmt, ...) __attribute__((noreturn, format(printf, 1, 2)));

#ifdef __cplusplus
}
#endif

#endif // JWSIM_ENGINE_H
