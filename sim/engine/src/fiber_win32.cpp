#if defined(_WIN32)

#include "fiber.h"

#include <windows.h>

#include "jwsim/engine.h"

namespace jwsim {

struct Fiber {
  LPVOID handle = nullptr;
  bool owns = false;
  FiberEntry entry = nullptr;
  void *arg = nullptr;
};

static VOID CALLBACK trampoline(LPVOID param) {
  Fiber *f = static_cast<Fiber *>(param);
  f->entry(f->arg);
  jwsim_fatal("fibra retornó de su función de entrada");
}

Fiber *fiber_from_thread() {
  Fiber *f = new Fiber();
  f->handle = ConvertThreadToFiber(nullptr);
  if (!f->handle) f->handle = GetCurrentFiber();
  return f;
}

Fiber *fiber_create(size_t stack_bytes, FiberEntry entry, void *arg) {
  Fiber *f = new Fiber();
  f->entry = entry;
  f->arg = arg;
  f->owns = true;
  f->handle = CreateFiber(stack_bytes, trampoline, f);
  if (!f->handle) jwsim_fatal("CreateFiber falló (%lu)", GetLastError());
  return f;
}

void fiber_switch(Fiber *, Fiber *to) { SwitchToFiber(to->handle); }

void fiber_destroy(Fiber *f) {
  if (f->owns && f->handle) DeleteFiber(f->handle);
  delete f;
}

} // namespace jwsim

#endif
