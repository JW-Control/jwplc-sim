// Contextos de ejecución cooperativos (fibras) para las tareas simuladas.
// Implementaciones: fiber_posix.cpp (ucontext) y fiber_win32.cpp (Fibers).
#ifndef JWSIM_FIBER_H
#define JWSIM_FIBER_H

#include <stddef.h>

namespace jwsim {

struct Fiber;
using FiberEntry = void (*)(void *arg);

// Convierte el hilo actual en fibra (contexto del planificador).
Fiber *fiber_from_thread();
// Crea una fibra con su propia pila. entry nunca debe retornar.
Fiber *fiber_create(size_t stack_bytes, FiberEntry entry, void *arg);
void fiber_switch(Fiber *from, Fiber *to);
// Libera una fibra que no está en ejecución.
void fiber_destroy(Fiber *fiber);

} // namespace jwsim

#endif
