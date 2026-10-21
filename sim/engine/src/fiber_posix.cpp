// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Fibras para sistemas POSIX.
//
// x86 y x86_64: cambio de contexto propio en ensamblador (guarda solo los
// registros que la ABI exige preservar + MXCSR y la palabra de control x87).
// No hace llamadas al sistema y funciona con cualquier libc (glibc, musl).
// Otras arquitecturas, y builds con AddressSanitizer: ucontext.
#if !defined(_WIN32)

#include "fiber.h"

#include <stdint.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <unistd.h>

#include "jwsim/engine.h"

#if defined(__has_feature)
#if __has_feature(address_sanitizer)
#define JWSIM_ASAN 1
#endif
#endif
#if defined(__SANITIZE_ADDRESS__)
#define JWSIM_ASAN 1
#endif

#if (defined(__x86_64__) || defined(__i386__)) && !defined(JWSIM_ASAN) && !defined(JWSIM_FIBER_UCONTEXT)
#define JWSIM_FIBER_ASM 1
#else
#include <ucontext.h>
#endif

#if defined(__APPLE__)
#define JWSIM_SYM(name) "_" #name
#else
#define JWSIM_SYM(name) #name
#endif

#if JWSIM_FIBER_ASM
extern "C" void jwsim_ctx_switch(void **save_sp, void *load_sp);
extern "C" void jwsim_ctx_start(void);

#if defined(__x86_64__)
// Pila al cambiar: [mxcsr|fpucw][r15][r14][r13][r12][rbx][rbp][ret]
__asm__(".text\n"
        ".globl " JWSIM_SYM(jwsim_ctx_switch) "\n"
        JWSIM_SYM(jwsim_ctx_switch) ":\n"
        "  pushq %rbp\n"
        "  pushq %rbx\n"
        "  pushq %r12\n"
        "  pushq %r13\n"
        "  pushq %r14\n"
        "  pushq %r15\n"
        "  subq $8, %rsp\n"
        "  stmxcsr (%rsp)\n"
        "  fnstcw 4(%rsp)\n"
        "  movq %rsp, (%rdi)\n"
        "  movq %rsi, %rsp\n"
        "  ldmxcsr (%rsp)\n"
        "  fldcw 4(%rsp)\n"
        "  addq $8, %rsp\n"
        "  popq %r15\n"
        "  popq %r14\n"
        "  popq %r13\n"
        "  popq %r12\n"
        "  popq %rbx\n"
        "  popq %rbp\n"
        "  ret\n"
        ".globl " JWSIM_SYM(jwsim_ctx_start) "\n"
        JWSIM_SYM(jwsim_ctx_start) ":\n"
        "  movq %r13, %rdi\n"
        "  callq *%r12\n"
        "  ud2\n");
#else
// Pila al cambiar: [mxcsr|fpucw][edi][esi][ebx][ebp][ret]
__asm__(".text\n"
        ".globl " JWSIM_SYM(jwsim_ctx_switch) "\n"
        JWSIM_SYM(jwsim_ctx_switch) ":\n"
        "  movl 4(%esp), %eax\n"
        "  movl 8(%esp), %edx\n"
        "  pushl %ebp\n"
        "  pushl %ebx\n"
        "  pushl %esi\n"
        "  pushl %edi\n"
        "  subl $8, %esp\n"
        "  stmxcsr (%esp)\n"
        "  fnstcw 4(%esp)\n"
        "  movl %esp, (%eax)\n"
        "  movl %edx, %esp\n"
        "  ldmxcsr (%esp)\n"
        "  fldcw 4(%esp)\n"
        "  addl $8, %esp\n"
        "  popl %edi\n"
        "  popl %esi\n"
        "  popl %ebx\n"
        "  popl %ebp\n"
        "  ret\n"
        ".globl " JWSIM_SYM(jwsim_ctx_start) "\n"
        JWSIM_SYM(jwsim_ctx_start) ":\n"
        "  pushl %edi\n"
        "  calll *%esi\n"
        "  ud2\n");
#endif
#endif // JWSIM_FIBER_ASM

namespace jwsim {

struct Fiber {
#if JWSIM_FIBER_ASM
  void *sp = nullptr;
#else
  ucontext_t ctx;
#endif
  void *mapping = nullptr;   // pila + página de guarda
  size_t mapping_size = 0;
  FiberEntry entry = nullptr;
  void *arg = nullptr;
};

namespace {

[[noreturn]] void fiber_main(Fiber *f) {
  f->entry(f->arg);
  jwsim_fatal("fibra retornó de su función de entrada");
}

#if JWSIM_FIBER_ASM
extern "C" void jwsim_fiber_entry(void *arg) { fiber_main(static_cast<Fiber *>(arg)); }
#else
void trampoline(unsigned hi, unsigned lo) {
  fiber_main(reinterpret_cast<Fiber *>(static_cast<uintptr_t>((static_cast<uint64_t>(hi) << 32) | lo)));
}
#endif

} // namespace

Fiber *fiber_from_thread() {
  Fiber *f = new Fiber();
#if !JWSIM_FIBER_ASM
  getcontext(&f->ctx);
#endif
  return f;
}

Fiber *fiber_create(size_t stack_bytes, FiberEntry entry, void *arg) {
  const size_t page = static_cast<size_t>(sysconf(_SC_PAGESIZE));
  stack_bytes = (stack_bytes + page - 1) / page * page;
  Fiber *f = new Fiber();
  f->entry = entry;
  f->arg = arg;
  f->mapping_size = stack_bytes + page;
  f->mapping = mmap(nullptr, f->mapping_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (f->mapping == MAP_FAILED) jwsim_fatal("mmap de pila falló");
  // Página de guarda al fondo: un desborde de pila produce SIGSEGV inmediato.
  mprotect(f->mapping, page, PROT_NONE);
  char *stack_lo = static_cast<char *>(f->mapping) + page;

#if JWSIM_FIBER_ASM
  const uintptr_t base = reinterpret_cast<uintptr_t>(stack_lo + stack_bytes) & ~static_cast<uintptr_t>(15);
  const uint32_t csr[2] = {0x1F80u, 0x037Fu};   // MXCSR y palabra de control x87 por defecto
#if defined(__x86_64__)
  // Tras el `ret` de jwsim_ctx_switch, rsp = base (alineado a 16) para la
  // llamada de jwsim_ctx_start.
  uintptr_t *slot = reinterpret_cast<uintptr_t *>(base - 8);
  slot[0] = reinterpret_cast<uintptr_t>(&jwsim_ctx_start);   // ret
  slot[-1] = 0;                                                // rbp
  slot[-2] = 0;                                                // rbx
  slot[-3] = reinterpret_cast<uintptr_t>(&jwsim_fiber_entry);  // r12
  slot[-4] = reinterpret_cast<uintptr_t>(f);                   // r13
  slot[-5] = 0;                                                // r14
  slot[-6] = 0;                                                // r15
  uint32_t *c = reinterpret_cast<uint32_t *>(&slot[-7]);
  c[0] = csr[0];
  c[1] = csr[1];
  f->sp = &slot[-7];
#else
  // Tras el `ret`, esp ≡ 4 (mód 16): `pushl arg` + `call` dejan la pila
  // alineada a 16 en la llamada, como exige la ABI i386 de Linux.
  uint32_t *slot = reinterpret_cast<uint32_t *>(base - 16);
  slot[0] = reinterpret_cast<uint32_t>(&jwsim_ctx_start);    // ret
  slot[-1] = 0;                                              // ebp
  slot[-2] = 0;                                              // ebx
  slot[-3] = reinterpret_cast<uint32_t>(&jwsim_fiber_entry); // esi
  slot[-4] = reinterpret_cast<uint32_t>(f);                  // edi
  slot[-6] = csr[0];
  slot[-5] = csr[1];
  f->sp = &slot[-6];
#endif
#else
  getcontext(&f->ctx);
  f->ctx.uc_stack.ss_sp = stack_lo;
  f->ctx.uc_stack.ss_size = stack_bytes;
  f->ctx.uc_link = nullptr;
  const uint64_t p = reinterpret_cast<uintptr_t>(f);
  makecontext(&f->ctx, reinterpret_cast<void (*)()>(trampoline), 2, static_cast<unsigned>(p >> 32),
              static_cast<unsigned>(p & 0xffffffffu));
#endif
  return f;
}

void fiber_switch(Fiber *from, Fiber *to) {
#if JWSIM_FIBER_ASM
  jwsim_ctx_switch(&from->sp, to->sp);
#else
  swapcontext(&from->ctx, &to->ctx);
#endif
}

void fiber_destroy(Fiber *f) {
  if (f->mapping) munmap(f->mapping, f->mapping_size);
  delete f;
}

} // namespace jwsim

#endif
