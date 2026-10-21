#if !defined(_WIN32)

#include "fiber.h"

#include <stdint.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <ucontext.h>
#include <unistd.h>

#include "jwsim/engine.h"

namespace jwsim {

struct Fiber {
  ucontext_t ctx;
  void *mapping = nullptr;   // pila + página de guarda
  size_t mapping_size = 0;
  FiberEntry entry = nullptr;
  void *arg = nullptr;
};

static void trampoline(unsigned hi, unsigned lo) {
  Fiber *f = reinterpret_cast<Fiber *>((static_cast<uintptr_t>(hi) << 32) | lo);
  f->entry(f->arg);
  jwsim_fatal("fibra retornó de su función de entrada");
}

Fiber *fiber_from_thread() {
  Fiber *f = new Fiber();
  getcontext(&f->ctx);
  return f;
}

Fiber *fiber_create(size_t stack_bytes, FiberEntry entry, void *arg) {
  const size_t page = static_cast<size_t>(sysconf(_SC_PAGESIZE));
  stack_bytes = (stack_bytes + page - 1) / page * page;
  Fiber *f = new Fiber();
  f->entry = entry;
  f->arg = arg;
  f->mapping_size = stack_bytes + page;
  f->mapping = mmap(nullptr, f->mapping_size, PROT_READ | PROT_WRITE,
                    MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (f->mapping == MAP_FAILED) jwsim_fatal("mmap de pila falló");
  // Página de guarda al fondo: un desborde de pila produce SIGSEGV inmediato.
  mprotect(f->mapping, page, PROT_NONE);

  getcontext(&f->ctx);
  f->ctx.uc_stack.ss_sp = static_cast<char *>(f->mapping) + page;
  f->ctx.uc_stack.ss_size = stack_bytes;
  f->ctx.uc_link = nullptr;
  const uintptr_t p = reinterpret_cast<uintptr_t>(f);
  makecontext(&f->ctx, reinterpret_cast<void (*)()>(trampoline), 2,
              static_cast<unsigned>(p >> 32), static_cast<unsigned>(p & 0xffffffffu));
  return f;
}

void fiber_switch(Fiber *from, Fiber *to) { swapcontext(&from->ctx, &to->ctx); }

void fiber_destroy(Fiber *f) {
  if (f->mapping) munmap(f->mapping, f->mapping_size);
  delete f;
}

} // namespace jwsim

#endif
