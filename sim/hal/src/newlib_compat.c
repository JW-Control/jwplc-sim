// Funciones no estándar que newlib (toolchain xtensa) ofrece y glibc/MinGW no.
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static char *jwsim_utoa_impl(unsigned long value, char *s, int radix, int negative) {
  static const char digits[] = "0123456789abcdefghijklmnopqrstuvwxyz";
  char tmp[sizeof(unsigned long) * 8 + 2];
  int i = 0;
  if (radix < 2 || radix > 36) {
    s[0] = '\0';
    return s;
  }
  do {
    tmp[i++] = digits[value % (unsigned)radix];
    value /= (unsigned)radix;
  } while (value);
  int j = 0;
  if (negative) s[j++] = '-';
  while (i) s[j++] = tmp[--i];
  s[j] = '\0';
  return s;
}

#if !defined(_WIN32)  // MinGW ya ofrece itoa (msvcrt)
char *itoa(int value, char *s, int radix) {
  if (value < 0 && radix == 10) return jwsim_utoa_impl((unsigned long)(-(long)value), s, radix, 1);
  return jwsim_utoa_impl((unsigned)value, s, radix, 0);
}
#endif
char *utoa(unsigned int value, char *s, int radix) { return jwsim_utoa_impl(value, s, radix, 0); }
