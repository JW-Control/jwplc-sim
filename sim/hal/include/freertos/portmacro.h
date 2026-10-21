#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef uint32_t TickType_t;
typedef int BaseType_t;
typedef unsigned int UBaseType_t;
typedef uint8_t StackType_t;
typedef struct { uint32_t owner; uint32_t count; } portMUX_TYPE;
typedef portMUX_TYPE spinlock_t;

#define portMAX_DELAY ((TickType_t)0xffffffffUL)
#define portTICK_PERIOD_MS ((TickType_t)(1000 / CONFIG_FREERTOS_HZ))
#define portTICK_RATE_MS portTICK_PERIOD_MS
#define portNUM_PROCESSORS 2
#define portBYTE_ALIGNMENT 4
#define portSTACK_TYPE uint8_t
#define portBASE_TYPE int
#define portMUX_INITIALIZER_UNLOCKED {0, 0}
#define SPINLOCK_INITIALIZER {0, 0}
#define tskNO_AFFINITY ((BaseType_t)0x7FFFFFFF)

// Secciones críticas: con un único hilo del SO basta con impedir la
// conmutación de tareas mientras dure la sección.
void jwsim_port_enter_critical(void);
void jwsim_port_exit_critical(void);
BaseType_t xPortGetCoreID(void);
BaseType_t xPortInIsrContext(void);
void jwsim_port_yield(void);

static inline void portMUX_INIT_impl(portMUX_TYPE *m) { m->owner = 0; m->count = 0; }
#define portMUX_INITIALIZE(mux) portMUX_INIT_impl(mux)
#define spinlock_initialize(mux) portMUX_INIT_impl(mux)
#define portENTER_CRITICAL(mux) jwsim_port_enter_critical()
#define portEXIT_CRITICAL(mux) jwsim_port_exit_critical()
#define portENTER_CRITICAL_ISR(mux) jwsim_port_enter_critical()
#define portEXIT_CRITICAL_ISR(mux) jwsim_port_exit_critical()
#define portENTER_CRITICAL_SAFE(mux) jwsim_port_enter_critical()
#define portEXIT_CRITICAL_SAFE(mux) jwsim_port_exit_critical()
#define taskENTER_CRITICAL(mux) jwsim_port_enter_critical()
#define taskEXIT_CRITICAL(mux) jwsim_port_exit_critical()
#define taskENTER_CRITICAL_ISR(mux) jwsim_port_enter_critical()
#define taskEXIT_CRITICAL_ISR(mux) jwsim_port_exit_critical()
#define portDISABLE_INTERRUPTS() jwsim_port_enter_critical()
#define portENABLE_INTERRUPTS() jwsim_port_exit_critical()
#define portSET_INTERRUPT_MASK_FROM_ISR() (jwsim_port_enter_critical(), 0)
#define portCLEAR_INTERRUPT_MASK_FROM_ISR(x) ((void)(x), jwsim_port_exit_critical())
#define portYIELD() jwsim_port_yield()
#define portYIELD_FROM_ISR(...) ((void)0)
#define portYIELD_WITHIN_API() jwsim_port_yield()
#define portEND_SWITCHING_ISR(x) ((void)(x))
#define portNOP() ((void)0)
#define portGET_CORE_ID() xPortGetCoreID()
#define portCHECK_IF_IN_ISR() xPortInIsrContext()

#ifdef __cplusplus
}
#endif
