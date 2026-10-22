// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Toolchains nativos soportados. Todos son GCC, como el compilador del ESP32
// (xtensa-esp32-elf-gcc): clang rechaza código válido del package (hallazgo
// H10 en docs/ARCHITECTURE.md).
//   native    : gcc del sistema para el SO actual (en Windows, MinGW-w64).
//   windows   : x86_64 Windows con MinGW-w64 GCC (hilos posix). Desde Linux,
//               compilación cruzada con x86_64-w64-mingw32-gcc-posix.
//   linux-x86 : Linux i386 (gcc -m32). Modelo de datos ILP32, idéntico al
//               ESP32; sirve para verificar código que depende de
//               sizeof(long) == 4 en hosts Linux (ARCHITECTURE §10.2).
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bundledToolchainBin, ensurePchFriendlyCompiler } from "../../scripts/fetch-toolchain.mjs";

const EXTRA = (process.env.JWSIM_EXTRA_FLAGS ?? "").split(/\s+/).filter(Boolean);
const COMMON = ["-O1", "-g", "-fno-strict-aliasing", "-Wno-unused-parameter", ...EXTRA];

const NEWLIB_COMPAT = ["-include", join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sim", "hal", "include", "jwsim_newlib_compat.h")];

export const TARGETS = ["native", "windows", "linux-x86"];

function which(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function base(os) {
  const isGlibc = os === "linux";
  return {
    os,
    cflags: ["-std=gnu17", ...COMMON],
    // newlib (toolchain xtensa) declara strchr/strstr sin sobrecargas const en
    // C++; glibc sí: jwsim_newlib_compat.h las desactiva.
    cxxflags: ["-std=gnu++2b", ...COMMON, ...(isGlibc ? NEWLIB_COMPAT : [])],
    groupStart: os === "darwin" ? [] : ["-Wl,--start-group"],
    groupEnd: os === "darwin" ? [] : ["-Wl,--end-group"],
    exeSuffix: os === "windows" ? ".exe" : "",
  };
}

export function toolchain(target = "native", ccOverride) {
  if (target === "windows" && process.platform !== "win32") {
    const prefix = process.env.JWSIM_MINGW_PREFIX ?? "x86_64-w64-mingw32-";
    const suffix = which(`${prefix}g++-posix`) ? "-posix" : "";
    return {
      ...base("windows"),
      dataModel: "LLP64",
      cc: [`${prefix}gcc${suffix}`],
      cxx: [`${prefix}g++${suffix}`],
      ar: [`${prefix}ar`],
      nm: [`${prefix}nm`],
      objcopy: [`${prefix}objcopy`],
      weakPE: true,
      ldflags: ["-static", ...EXTRA],
      available: which(`${prefix}g++${suffix}`),
    };
  }
  if (target === "linux-x86") {
    if (process.platform !== "linux") throw new Error("--target linux-x86 solo está disponible en Linux");
    return {
      ...base("linux"),
      dataModel: "ILP32",
      cc: ["gcc", "-m32"],
      cxx: ["g++", "-m32"],
      ar: ["ar"],
      nm: ["nm"],
      ldflags: ["-static", "-pthread", ...EXTRA],
      available: which("g++"),
    };
  }
  if (target !== "native" && !(target === "windows" && process.platform === "win32")) {
    throw new Error(`destino desconocido '${target}' (opciones: ${TARGETS.join(", ")})`);
  }
  const os = process.platform === "win32" ? "windows" : process.platform;
  // clang solo a pedido explícito (--cc clang): ver hallazgo H10.
  const useClang = ccOverride === "clang";
  // Toolchain incluido (scripts/fetch-toolchain.mjs) antes que el del PATH.
  const bin = useClang ? null : bundledToolchainBin();
  const tool = (name) => (bin ? join(bin, process.platform === "win32" ? `${name}.exe` : name) : name);
  // En Windows, cc1/cc1plus sin ASLR para que el PCH cargue siempre
  // (scripts/fetch-toolchain.mjs). La etiqueta separa los PCH generados antes.
  const pchTag = bin && os === "windows" && ensurePchFriendlyCompiler(bin) ? "sin-aslr" : "";
  return {
    ...base(os),
    dataModel: os === "windows" ? "LLP64" : "LP64",
    bundled: !!bin,
    pchTag,
    cc: [useClang ? "clang" : tool("gcc")],
    cxx: [useClang ? "clang++" : tool("g++")],
    ar: [tool("ar")],
    nm: [tool("nm")],
    objcopy: [tool("objcopy")],
    // Depurador para G3 (gdb -i=dap): el del toolchain incluido o el del PATH.
    gdb: useClang ? "lldb" : tool("gdb"),
    weakPE: os === "windows" && !useClang,
    ldflags: os === "windows" ? ["-static", ...EXTRA] : ["-pthread", ...EXTRA],
    available: !!bin || which(useClang ? "clang++" : "g++"),
  };
}
