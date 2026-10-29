// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Autocompletado del editor para el JWPLC Basic: solo lo que el sketch debe
// usar, según dónde está el cursor. El catálogo sale de los headers del
// package fijado (cli/lib/api-catalog.mjs) y de los propios archivos del
// sketch; no se usan las sugerencias por palabras de Monaco.
//
//   digitalRead(|           I0_0…I0_7 y los alias del sketch (#define MARCHA I0_0)
//   digitalWrite(|          Q0_0…Q0_7 y sus alias; segundo argumento HIGH/LOW
//   JWPLC_Buttons.pressed(| BTN_*
//   JWPLC_IO.input(|        0…7
//   JWPLC_Buzzer.|          métodos públicos que el sketch debe usar
//   en otro lugar           API del Basic, Arduino básico y lo declarado en el sketch
"use strict";

(() => {
  // Arduino que sí se usa en el Basic (GUIA_SKETCH_BASIC.md de jwplc-firmware).
  const ARDUINO = [
    { name: "digitalRead", ret: "int", params: [{ type: "uint8_t", name: "pin" }], doc: "Lee una entrada: I0_0…I0_7." },
    { name: "digitalWrite", ret: "void", params: [{ type: "uint8_t", name: "pin" }, { type: "uint8_t", name: "valor" }], doc: "Escribe una salida a relé: Q0_0…Q0_7, HIGH o LOW." },
    { name: "millis", ret: "unsigned long", params: [], doc: "Milisegundos desde el arranque. Los tiempos se llevan con millis(), no con delay()." },
    { name: "micros", ret: "unsigned long", params: [], doc: "Microsegundos desde el arranque." },
    { name: "delay", ret: "void", params: [{ type: "unsigned long", name: "ms" }], doc: "Espera bloqueante. Evítela en loop(): frena Modbus, menús y temporizadores." },
  ];
  const SERIAL = [
    { name: "begin", ret: "void", params: [{ type: "unsigned long", name: "baudios" }], doc: "Consola USB: Serial.begin(115200) va en setup()." },
    { name: "print", ret: "size_t", params: [{ type: "", name: "valor" }] },
    { name: "println", ret: "size_t", params: [{ type: "", name: "valor" }] },
    { name: "printf", ret: "size_t", params: [{ type: "const char *", name: "formato" }, { type: "", name: "..." }] },
    { name: "available", ret: "int", params: [] },
    { name: "read", ret: "int", params: [] },
    { name: "write", ret: "size_t", params: [{ type: "uint8_t", name: "byte" }] },
  ];
  const KEYWORDS = "if else for while do switch case default break continue return const static volatile unsigned void bool true false int long float double char byte uint8_t uint16_t uint32_t int16_t int32_t size_t String struct enum".split(" ");
  const TYPES = "bool|int|long|float|double|char|byte|String|unsigned long|unsigned int|unsigned|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t|auto";

  const sig = (f) => `${f.ret ? f.ret + " " : ""}${f.name}(${(f.params ?? []).map((p) => `${p.type ? p.type + " " : ""}${p.name}${p.def !== undefined ? ` = ${p.def}` : ""}`).join(", ")})`;

  /** Lo declarado en el sketch: funciones, variables, #define y sus alias de pines. */
  function scanSketch(models) {
    const ids = new Map();
    const alias = { input: [], output: [] };
    for (const m of models) {
      const text = m.getValue().replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, "");
      for (const x of text.matchAll(/#define\s+([A-Za-z_]\w*)\s+([^\n]*)/g)) {
        ids.set(x[1], { kind: "define", detail: `#define ${x[1]} ${x[2].trim()}`.slice(0, 80) });
        const pin = x[2].trim().match(/^(I0_\d|Q0_\d)$/);
        if (pin) alias[pin[1][0] === "I" ? "input" : "output"].push({ name: x[1], pin: pin[1] });
      }
      for (const x of text.matchAll(new RegExp(`\\b(?:${TYPES})\\s*[*&]?\\s+([A-Za-z_]\\w*)\\s*\\(`, "g"))) {
        if (!["if", "while", "for", "switch", "return"].includes(x[1])) ids.set(x[1], { kind: "function", detail: "función del sketch" });
      }
      for (const x of text.matchAll(new RegExp(`\\b(?:const\\s+|static\\s+|constexpr\\s+|volatile\\s+)*(?:${TYPES})\\s+([A-Za-z_]\\w*)\\s*(=\\s*([^;,\\n]*))?\\s*[;,=)\\[]`, "g"))) {
        if (!ids.has(x[1])) ids.set(x[1], { kind: "variable", detail: "variable del sketch" });
        const pin = (x[3] ?? "").trim().match(/^(I0_\d|Q0_\d)$/);
        if (pin) alias[pin[1][0] === "I" ? "input" : "output"].push({ name: x[1], pin: pin[1] });
      }
      for (const x of text.matchAll(/\benum\b[^{]*\{([^}]*)\}/g)) {
        for (const v of x[1].matchAll(/([A-Za-z_]\w*)\s*(?:=[^,]*)?(?:,|$)/g)) ids.set(v[1], { kind: "enum", detail: "valor de enum del sketch" });
      }
    }
    return { ids, alias };
  }

  /** Llamada abierta más interna antes del cursor: { callee, arg } o null. */
  function openCall(before) {
    let depth = 0;
    let commas = 0;
    for (let i = before.length - 1; i >= 0; i--) {
      const ch = before[i];
      if (ch === '"' || ch === "'") {
        // salta un literal hacia atrás
        const q = ch;
        i--;
        while (i >= 0 && !(before[i] === q && before[i - 1] !== "\\")) i--;
        continue;
      }
      if (ch === ")" || ch === "]") depth++;
      else if (ch === "(" || ch === "[") {
        if (depth === 0) {
          if (ch === "[") return null;
          const m = before.slice(0, i).match(/([A-Za-z_]\w*(?:\s*(?:\.|->|::)\s*[A-Za-z_]\w*)*)\s*$/);
          return m ? { callee: m[1].replace(/\s+/g, "").replace("->", "."), arg: commas } : null;
        }
        depth--;
      } else if (ch === "," && depth === 0) commas++;
      else if ((ch === ";" || ch === "{" || ch === "}") && depth === 0) return null;
    }
    return null;
  }

  function install(monaco, catalog, getModels) {
    const K = monaco.languages.CompletionItemKind;
    const globals = new Map(catalog.globals.map((g) => [g.name, g]));
    const doc = (s) => (s ? { value: s } : undefined);
    const item = (range, label, kind, extra = {}) => ({ label, kind, insertText: label, range, ...extra });

    const pinItems = (range, which, alias) => {
      const pins = which === "input" ? catalog.pins.inputs : catalog.pins.outputs;
      const what = which === "input" ? "Entrada digital" : "Salida a relé";
      return [
        ...alias[which].map((a, i) => item(range, a.name, K.Variable, { detail: `→ ${a.pin}`, sortText: `0${i}`, documentation: doc(`Alias del sketch de ${a.pin}.`) })),
        ...pins.map((p, i) => item(range, p, K.Constant, { detail: `${what} ${p.slice(3)} (borne ${p.replace("_", ".")})`, sortText: `1${i}` })),
      ];
    };

    // Lista de valores para un argumento concreto, o null si no hay regla.
    function argItems(range, call, sketch) {
      const c = call.callee;
      if (c === "digitalRead" && call.arg === 0) return pinItems(range, "input", sketch.alias);
      if (c === "digitalWrite" && call.arg === 0) return pinItems(range, "output", sketch.alias);
      if (c === "digitalWrite" && call.arg === 1) return ["HIGH", "LOW"].map((v, i) => item(range, v, K.Constant, { sortText: `${i}`, detail: v === "HIGH" ? "relé cerrado" : "relé abierto" }));
      const [obj, method] = c.split(".");
      const g = globals.get(obj);
      if (g && method) {
        const m = g.members.find((x) => x.name === method);
        const p = m?.params?.[call.arg];
        if (obj === "JWPLC_Buttons" && p && /^(id|btn|button|key)$/i.test(p.name)) {
          return catalog.buttons.map((b, i) => item(range, b, K.EnumMember, { sortText: `${i}`, detail: "tecla de la botonera" }));
        }
        if (obj === "JWPLC_IO" && /^(input|output)$/.test(method) && call.arg === 0) {
          return Array.from({ length: 8 }, (_, k) => item(range, String(k), K.Value, { sortText: `${k}`, detail: method === "input" ? `I0_${k}` : `Q0_${k}` }));
        }
      }
      return null;
    }

    function generalItems(range, sketch) {
      const out = [];
      for (const [name, info] of sketch.ids) {
        out.push(item(range, name, info.kind === "function" ? K.Function : info.kind === "enum" ? K.EnumMember : info.kind === "define" ? K.Constant : K.Variable, { detail: info.detail, sortText: `0${name}` }));
      }
      for (const f of ARDUINO) out.push(item(range, f.name, K.Function, { detail: sig(f), documentation: doc(f.doc), sortText: `1${f.name}` }));
      out.push(item(range, "Serial", K.Module, { detail: "consola USB", sortText: "1Serial" }));
      for (const g of catalog.globals) out.push(item(range, g.name, K.Module, { detail: g.cls, documentation: doc("Objeto global del package: no se declara otro."), sortText: `2${g.name}` }));
      for (const f of catalog.functions) out.push(item(range, f.name, K.Function, { detail: f.signature, sortText: `2${f.name}` }));
      for (const p of [...catalog.pins.inputs, ...catalog.pins.outputs]) out.push(item(range, p, K.Constant, { detail: p[0] === "I" ? "entrada digital" : "salida a relé", sortText: `3${p}` }));
      for (const b of catalog.buttons) out.push(item(range, b, K.EnumMember, { detail: "tecla de la botonera", sortText: `3${b}` }));
      for (const v of ["HIGH", "LOW"]) out.push(item(range, v, K.Constant, { sortText: `3${v}` }));
      for (const k of KEYWORDS) out.push(item(range, k, K.Keyword, { sortText: `4${k}` }));
      return out;
    }

    function members(range, obj) {
      if (obj === "Serial") return SERIAL.map((f) => item(range, f.name, K.Method, { detail: sig(f), documentation: doc(f.doc) }));
      const g = globals.get(obj);
      if (!g) return null;
      return g.members.map((m) => item(range, m.name, K.Method, { detail: m.signatures.join("\n"), documentation: doc(m.doc) }));
    }

    monaco.languages.registerCompletionItemProvider("cpp", {
      triggerCharacters: ["(", ",", ".", ":", " "],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        const before = model.getValueInRange({ startLineNumber: Math.max(1, position.lineNumber - 40), startColumn: 1, endLineNumber: position.lineNumber, endColumn: word.startColumn });
        const line = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
        // Dentro de un comentario o de una cadena: nada.
        if (/\/\/[^\n]*$/.test(line) || (line.split('"').length - 1) % 2 === 1) return { suggestions: [] };
        const mem = line.match(/([A-Za-z_]\w*)\s*(\.|->)\s*$/);
        if (mem) {
          const list = members(range, mem[1]);
          return { suggestions: list ?? [] };
        }
        if (/\bJWPLCButtons\s*::\s*$/.test(line)) {
          return { suggestions: catalog.functions.filter((f) => f.name.startsWith("JWPLCButtons::")).map((f) => item(range, f.name.split("::")[1], K.Function, { detail: f.signature })) };
        }
        const sketch = scanSketch(getModels());
        const call = openCall(before);
        if (call) {
          const list = argItems(range, call, sketch);
          if (list) return { suggestions: list };
        }
        // Tras un espacio o una coma solo se sugiere si ya se empezó una palabra.
        if (!word.word && /[\s,]$/.test(line) && !call) return { suggestions: [] };
        return { suggestions: generalItems(range, sketch) };
      },
    });

    monaco.languages.registerSignatureHelpProvider("cpp", {
      signatureHelpTriggerCharacters: ["(", ","],
      signatureHelpRetriggerCharacters: [","],
      provideSignatureHelp(model, position) {
        const before = model.getValueInRange({ startLineNumber: Math.max(1, position.lineNumber - 40), startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const call = openCall(before);
        if (!call) return null;
        let fns = [];
        const [obj, method] = call.callee.split(".");
        if (method && obj === "Serial") fns = SERIAL.filter((f) => f.name === method).map((f) => ({ label: sig(f), params: f.params, doc: f.doc }));
        else if (method && globals.has(obj)) {
          const m = globals.get(obj).members.find((x) => x.name === method);
          if (m) fns = [{ label: m.signature, params: m.params, doc: m.doc }];
        } else {
          const a = ARDUINO.find((f) => f.name === call.callee);
          if (a) fns = [{ label: sig(a), params: a.params, doc: a.doc }];
          const f = catalog.functions.find((x) => x.name === call.callee);
          if (f) fns = [{ label: f.signature, params: f.params }];
        }
        if (!fns.length) return null;
        return {
          value: {
            signatures: fns.map((f) => ({
              label: f.label,
              documentation: f.doc,
              parameters: f.params.map((p) => ({ label: `${p.type ? p.type + " " : ""}${p.name}${p.def !== undefined ? ` = ${p.def}` : ""}` })),
            })),
            activeSignature: 0,
            activeParameter: call.arg,
          },
          dispose() {},
        };
      },
    });
  }

  window.JwsimCompletion = { install, openCall, scanSketch };
})();
