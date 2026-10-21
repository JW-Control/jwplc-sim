// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Toolchains nativos soportados.
//   native  : compilador del sistema (gcc/clang) para el SO actual.
//   windows : x86_64-windows-gnu con `zig cc` (toolchain incluible en el
//             instalador; también sirve para compilar de forma cruzada).
import { execFileSync } from "node:child_process";

const EXTRA = (process.env.JWSIM_EXTRA_FLAGS ?? "").split(/\s+/).filter(Boolean);
const COMMON = ["-O1", "-g", "-fno-strict-aliasing", "-Wno-unused-parameter", ...EXTRA];

function which(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function toolchain(target, ccOverride) {
  if (target === "windows" || target === "zig") {
    const zig = process.env.JWSIM_ZIG ?? "zig";
    const triple = target === "windows" ? ["-target", "x86_64-windows-gnu"] : [];
    return {
      os: target === "windows" ? "windows" : process.platform,
      cc: [zig, "cc", ...triple],
      cxx: [zig, "c++", ...triple],
      ar: [zig, "ar"],
      cflags: ["-std=gnu17", ...COMMON],
      // libc++ añade sobrecargas const de strchr/strstr; newlib (ESP32) no.
      cxxflags: ["-std=gnu++2b", ...COMMON, "-D_LIBCPP_STRING_H_HAS_CONST_OVERLOADS"],
      ldflags: target === "windows" ? ["-static"] : [],
      groupStart: ["-Wl,--start-group"],
      groupEnd: ["-Wl,--end-group"],
      exeSuffix: target === "windows" ? ".exe" : "",
    };
  }
  const useClang = ccOverride === "clang" || (!ccOverride && !which("g++") && which("clang++"));
  const cc = useClang ? "clang" : "gcc";
  const cxx = useClang ? "clang++" : "g++";
  const isGlibc = process.platform === "linux";
  return {
    os: process.platform === "win32" ? "windows" : process.platform,
    cc: [cc],
    cxx: [cxx],
    ar: ["ar"],
    cflags: ["-std=gnu17", ...COMMON],
    // newlib (toolchain xtensa) declara strchr/strstr sin sobrecargas const en
    // C++; glibc sí. -fpermissive reproduce la aceptación del código del package.
    cxxflags: ["-std=gnu++2b", ...COMMON, ...(isGlibc ? ["-fpermissive", "-Wno-error"] : [])],
    ldflags: process.platform === "win32" ? ["-static", ...EXTRA] : ["-pthread", ...EXTRA],
    groupStart: process.platform === "darwin" ? [] : ["-Wl,--start-group"],
    groupEnd: process.platform === "darwin" ? [] : ["-Wl,--end-group"],
    exeSuffix: process.platform === "win32" ? ".exe" : "",
  };
}
