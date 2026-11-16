// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// @ts-check
// Expresiones aritméticas de los componentes declarativos (bloque «expr»):
// un analizador propio, sin eval ni Function, para que un componente de
// terceros no pueda ejecutar código. Admite números, variables, + − * / % ^,
// comparaciones (< <= > >= == !=, valen 1 o 0), && || !, el condicional
// c ? a : b y las funciones de FUNCS.

/** @type {Record<string, (...a: number[]) => number>} */
export const FUNCS = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  pow: Math.pow,
  clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
};
const CONSTS = { pi: Math.PI, e: Math.E, true: 1, false: 0 };

/** @typedef {(v: Record<string, number>) => number} Fn */

/**
 * Compila la expresión. Devuelve la función y las variables que usa.
 * @param {string} src
 * @returns {{ fn: Fn, vars: string[] }}
 */
export function compileExpr(src) {
  const text = String(src ?? "");
  /** @type {{ t: string, v: string, at: number }[]} */
  const toks = [];
  const re = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/%^()<>!?:,]))/y;
  let i = 0;
  while (i < text.length) {
    if (/^\s*$/.test(text.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) throw new Error(`expresión «${text}»: carácter no válido en la posición ${i + 1}`);
    toks.push(m[1] !== undefined ? { t: "num", v: m[1], at: i } : m[2] !== undefined ? { t: "id", v: m[2], at: i } : { t: "op", v: m[3], at: i });
    i = re.lastIndex;
  }
  let p = 0;
  const vars = new Set();
  const peek = () => toks[p];
  const fail = (msg) => {
    throw new Error(`expresión «${text}»: ${msg}`);
  };
  const eat = (v) => {
    if (peek()?.v !== v) fail(`se esperaba «${v}»${peek() ? ` y llegó «${peek().v}»` : " al final"}`);
    p++;
  };
  /** @returns {Fn} */
  const ternary = () => {
    const c = or();
    if (peek()?.v !== "?") return c;
    p++;
    const a = ternary();
    eat(":");
    const b = ternary();
    return (v) => (c(v) ? a(v) : b(v));
  };
  const bin = (next, ops) => () => {
    let l = next();
    while (peek()?.t === "op" && ops[peek().v]) {
      const f = ops[toks[p++].v];
      const a = l;
      const b = next();
      l = (v) => f(a(v), b(v));
    }
    return l;
  };
  /** @type {() => Fn} */
  const unary = () => {
    const t = peek();
    if (t?.v === "-") {
      p++;
      const a = unary();
      return (v) => -a(v);
    }
    if (t?.v === "+") {
      p++;
      return unary();
    }
    if (t?.v === "!") {
      p++;
      const a = unary();
      return (v) => (a(v) ? 0 : 1);
    }
    return power();
  };
  /** @type {() => Fn} */
  const power = () => {
    const b = atom();
    if (peek()?.v !== "^") return b;
    p++;
    const e = unary(); // asociativa a la derecha: 2^3^2 = 2^9
    return (v) => b(v) ** e(v);
  };
  /** @type {() => Fn} */
  const atom = () => {
    const t = toks[p++];
    if (!t) fail("termina antes de tiempo");
    if (t.t === "num") {
      const n = Number(t.v);
      return () => n;
    }
    if (t.v === "(") {
      const e = ternary();
      eat(")");
      return e;
    }
    if (t.t === "id") {
      if (peek()?.v === "(") {
        const f = FUNCS[t.v];
        if (!f) fail(`función desconocida «${t.v}» (hay: ${Object.keys(FUNCS).join(", ")})`);
        p++;
        /** @type {Fn[]} */
        const args = [];
        if (peek()?.v !== ")") {
          args.push(ternary());
          while (peek()?.v === ",") {
            p++;
            args.push(ternary());
          }
        }
        eat(")");
        return (v) => f(...args.map((a) => a(v)));
      }
      if (t.v in CONSTS) {
        const c = CONSTS[/** @type {keyof typeof CONSTS} */ (t.v)];
        return () => c;
      }
      const name = t.v;
      vars.add(name);
      return (v) => {
        const x = v[name];
        return typeof x === "number" ? x : Number(x ?? 0) || 0;
      };
    }
    return fail(`«${t.v}» fuera de lugar`);
  };
  const b01 = (x) => (x ? 1 : 0);
  const mulDiv = bin(unary, { "*": (a, b) => a * b, "/": (a, b) => a / b, "%": (a, b) => a % b });
  const addSub = bin(mulDiv, { "+": (a, b) => a + b, "-": (a, b) => a - b });
  const cmp = bin(addSub, { "<": (a, b) => b01(a < b), "<=": (a, b) => b01(a <= b), ">": (a, b) => b01(a > b), ">=": (a, b) => b01(a >= b) });
  const eq = bin(cmp, { "==": (a, b) => b01(a === b), "!=": (a, b) => b01(a !== b) });
  const and = bin(eq, { "&&": (a, b) => b01(a && b) });
  const or = bin(and, { "||": (a, b) => b01(a || b) });
  if (!toks.length) fail("está vacía");
  const fn = ternary();
  if (p < toks.length) fail(`sobra «${toks[p].v}»`);
  return { fn, vars: [...vars] };
}
