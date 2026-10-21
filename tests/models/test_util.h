// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Mini-marco de tests sin dependencias (los modelos no deben depender de un
// framework externo para poder compilarse con cualquier toolchain del proyecto).
#pragma once

#include <cstdio>
#include <functional>
#include <string>
#include <vector>

struct TestCase {
  const char *name;
  std::function<void()> fn;
};

inline std::vector<TestCase> &test_registry() {
  static std::vector<TestCase> r;
  return r;
}

inline int &test_failures() {
  static int n = 0;
  return n;
}

struct TestRegistrar {
  TestRegistrar(const char *name, std::function<void()> fn) { test_registry().push_back({name, std::move(fn)}); }
};

#define TEST(name)                                       \
  static void test_##name();                             \
  static TestRegistrar registrar_##name(#name, test_##name); \
  static void test_##name()

#define CHECK(cond)                                                                    \
  do {                                                                                 \
    if (!(cond)) {                                                                     \
      std::printf("    FALLA %s:%d: %s\n", __FILE__, __LINE__, #cond);                 \
      ++test_failures();                                                               \
    }                                                                                  \
  } while (0)

#define CHECK_EQ(a, b)                                                                              \
  do {                                                                                              \
    const auto va_ = (a);                                                                           \
    const auto vb_ = (b);                                                                           \
    if (!(va_ == vb_)) {                                                                            \
      std::printf("    FALLA %s:%d: %s == %s (%llu != %llu)\n", __FILE__, __LINE__, #a, #b,         \
                  static_cast<unsigned long long>(va_), static_cast<unsigned long long>(vb_));       \
      ++test_failures();                                                                            \
    }                                                                                               \
  } while (0)

inline int run_all_tests(const char *suite) {
  int failed_tests = 0;
  for (auto &t : test_registry()) {
    const int before = test_failures();
    t.fn();
    const bool ok = test_failures() == before;
    if (!ok) ++failed_tests;
    std::printf("  %s %s\n", ok ? "ok   " : "FALLA", t.name);
  }
  std::printf("%s: %zu tests, %d con fallas\n", suite, test_registry().size(), failed_tests);
  return failed_tests == 0 ? 0 : 1;
}
