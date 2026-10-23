// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Matriz de ejemplos del package (jwsim-cli matrix, G5 EXAMPLES_MATRIX):
// cada ejemplo de las librerías JW*/JWPLC_* × (compila, corre, pasa su
// prueba tests/examples/<librería>/<ejemplo>.jwtest.json). Informe JSON y
// tabla Markdown en build/gates/examples-matrix-<target>.{json,md}.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { ROOT } from "./build.mjs";
import { loadTest, runTest } from "./test.mjs";

export const EXAMPLE_TESTS = join(ROOT, "tests", "examples");

function sketchesIn(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (!statSync(p).isDirectory()) continue;
    if (existsSync(join(p, `${e}.ino`))) out.push(p);
    else out.push(...sketchesIn(p));
  }
  return out;
}

// Ejemplos del package: { lib, name, dir, rel (respecto del repo del package) }.
export function packageExamples(pkg) {
  const libs = join(pkg.root, pkg.lock.JWPLC_PACKAGE_TREE, "libraries");
  return readdirSync(libs)
    .filter((l) => /^JW/.test(l))
    .sort()
    .flatMap((lib) =>
      sketchesIn(join(libs, lib, "examples")).map((dir) => ({
        lib,
        name: relative(join(libs, lib, "examples"), dir).split(sep).join("/"),
        dir,
        rel: relative(pkg.root, dir).split(sep).join("/"),
      })),
    );
}

export const testFileFor = (ex) => join(EXAMPLE_TESTS, ex.lib, `${ex.name.replaceAll("/", "__")}.jwtest.json`);

export async function runMatrix(pkg, { target = "native", filter, log = () => {} } = {}) {
  const expect = JSON.parse(readFileSync(join(ROOT, "tests", "matrix-expectations.json"), "utf8"));
  const examples = packageExamples(pkg).filter((e) => !filter || e.rel.includes(filter));
  const rows = [];
  for (const ex of examples) {
    const classified = expect.obsolete[ex.rel] ?? expect.packageIssue?.[ex.rel] ?? expect.externalLibrary?.[ex.rel];
    const file = testFileFor(ex);
    const row = { library: ex.lib, example: ex.name, sketch: ex.rel, test: existsSync(file) ? relative(ROOT, file).split(sep).join("/") : null };
    if (classified) {
      // No compila por un motivo ajeno al simulador (tests/matrix-expectations.json).
      Object.assign(row, { compiles: "n/a", runs: "n/a", passes: "n/a", reason: classified, ok: true });
    } else if (!row.test) {
      Object.assign(row, { compiles: "?", runs: "?", passes: "sin prueba", ok: false });
    } else {
      const t = { ...loadTest(file), name: `${ex.lib}/${ex.name}` };
      const r = await runTest(t, { pkg, target, buildRoot: join(ROOT, "build", "examples") });
      const first = r.runs[0];
      const ranOk = first ? first.exit === (t.runs[0].expect?.exit ?? 0) && !first.failures.some((f) => f.includes("FATAL") || f.includes("JWSIM_RESULT")) : false;
      Object.assign(row, {
        compiles: r.stage === "build" ? (r.error?.includes("no está soportad") ? "no soportado" : "no") : "sí",
        runs: r.stage === "build" ? "—" : ranOk ? "sí" : "no",
        passes: r.ok ? "sí" : "no",
        ok: r.ok,
        wall_ms: r.wall_ms,
        ...(r.ok ? {} : { failures: r.error ? [r.error] : r.runs.flatMap((x) => x.failures) }),
      });
    }
    log(`${row.ok ? "OK   " : "FALLA"} ${row.library}/${row.example}: compila=${row.compiles} corre=${row.runs} prueba=${row.passes}${row.failures ? " — " + row.failures.slice(0, 3).join("; ") : ""}`);
    rows.push(row);
  }
  const count = (k, v) => rows.filter((r) => r[k] === v).length;
  const summary = {
    total: rows.length,
    classified: count("compiles", "n/a"),
    compiles: count("compiles", "sí"),
    runs: count("runs", "sí"),
    passes: count("passes", "sí"),
    without_test: count("passes", "sin prueba"),
    failed: rows.filter((r) => !r.ok).length,
  };
  const ok = summary.failed === 0 && rows.length > 0;
  const outDir = join(ROOT, "build", "gates");
  mkdirSync(outDir, { recursive: true });
  const report = { package: { ref: pkg.lock.JWPLC_PACKAGE_REF, commit: pkg.lock.JWPLC_PACKAGE_COMMIT }, target, ok, summary, rows };
  writeFileSync(join(outDir, `examples-matrix-${target}.json`), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(outDir, `examples-matrix-${target}.md`), markdown(report));
  log(
    `RESULTADO (${target}): ${summary.total} ejemplos; ${summary.compiles} compilan, ${summary.runs} corren, ${summary.passes} pasan su prueba; ` +
      `${summary.classified} clasificados, ${summary.without_test} sin prueba, ${summary.failed} con fallas`,
  );
  return { ok, summary, rows, report: join(outDir, `examples-matrix-${target}.json`) };
}

function markdown(report) {
  const s = report.summary;
  const lines = [
    `# Matriz de ejemplos — ${report.package.ref} (${String(report.package.commit).slice(0, 12)}), ${report.target}`,
    "",
    `${s.total} ejemplos: ${s.compiles} compilan, ${s.runs} corren, ${s.passes} pasan su prueba; ${s.classified} clasificados (no compilan por un motivo ajeno al simulador), ${s.without_test} sin prueba, ${s.failed} con fallas.`,
    "",
    "| Librería | Ejemplo | Compila | Corre | Pasa su prueba | Nota |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of report.rows) {
    const note = (r.reason ?? r.failures?.slice(0, 2).join("; ") ?? "").replaceAll("|", "\\|").slice(0, 160);
    lines.push(`| ${r.library} | ${r.example} | ${r.compiles} | ${r.runs} | ${r.passes} | ${note} |`);
  }
  return lines.join("\n") + "\n";
}
