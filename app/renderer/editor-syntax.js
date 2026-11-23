// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Colores del código como en Arduino IDE 2 (temas «Arduino Light» y «Arduino
// Dark»): tipos y calificadores en turquesa, control (if, return…) aparte,
// funciones en naranja, números y constantes, comentarios en gris. El
// resaltado C++ que trae Monaco junta tipos y control en «keyword» y no marca
// las funciones; este tokenizador los separa.
"use strict";

(() => {
  const TYPES = [
    "auto", "bool", "boolean", "byte", "char", "class", "const", "constexpr", "double", "enum", "explicit", "extern", "float",
    "inline", "int", "int8_t", "int16_t", "int32_t", "int64_t", "long", "mutable", "namespace", "private", "protected",
    "public", "register", "short", "signed", "size_t", "static", "String", "struct", "template", "typedef", "typename",
    "uint8_t", "uint16_t", "uint32_t", "uint64_t", "union", "unsigned", "using", "virtual", "void", "volatile", "word",
    "operator", "friend", "override", "final", "static_cast", "const_cast", "reinterpret_cast", "dynamic_cast",
  ];
  const CONTROL = [
    "break", "case", "catch", "continue", "default", "delete", "do", "else", "for", "goto", "if", "new", "return",
    "sizeof", "switch", "this", "throw", "try", "while",
  ];
  const CONSTANTS = [
    "true", "false", "nullptr", "NULL", "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "INPUT_PULLDOWN", "LED_BUILTIN",
    "LSBFIRST", "MSBFIRST", "CHANGE", "RISING", "FALLING", "PI", "HALF_PI", "TWO_PI", "DEC", "HEX", "OCT", "BIN",
  ];

  const LANG = {
    defaultToken: "",
    tokenPostfix: ".cpp",
    types: TYPES,
    control: CONTROL,
    constants: CONSTANTS,
    tokenizer: {
      root: [
        [/^\s*#\s*include/, { token: "keyword.directive", next: "@include" }],
        [/^\s*#\s*\w+/, "keyword.directive"],
        [/[a-zA-Z_]\w*(?=\s*\()/, { cases: { "@types": "keyword.type", "@control": "keyword.control", "@default": "function" } }],
        [/[a-zA-Z_]\w*/, { cases: { "@types": "keyword.type", "@control": "keyword.control", "@constants": "constant", "@default": "identifier" } }],
        { include: "@whitespace" },
        [/\d*\.\d+([eE][-+]?\d+)?[fFlL]?/, "number"],
        [/0[xX][0-9a-fA-F']+[uUlL]*/, "number"],
        [/0[bB][01']+[uUlL]*/, "number"],
        [/\d[\d']*[uUlLfF]*/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],
        [/'[^\\']'/, "string"],
        [/'\\.'/, "string"],
        [/[{}()[\]]/, "@brackets"],
        [/[;,.]/, "delimiter"],
        [/[=><!~?:&|+\-*/^%]+/, "operator"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      include: [
        [/\s*[<"][^>"]*[>"]/, "string", "@pop"],
        [/$/, "", "@pop"],
      ],
    },
  };

  // Colores tomados de Arduino IDE 2.3 (sin el «#» que Monaco no acepta).
  const DARK = {
    bg: "#1f272a", text: "dae3e3", type: "0ca1a6", control: "c586c0", func: "f39c12", number: "7fcbcd", comment: "7f8c8d",
    directive: "c586c0", lineNumber: "#858585", lineNumberActive: "#dae3e3", lineHighlight: "#263034", selection: "#1f4f73",
  };
  const LIGHT = {
    bg: "#ffffff", text: "4e5b61", type: "00979d", control: "728e00", func: "d35400", number: "005c5f", comment: "95a5a6",
    directive: "728e00", lineNumber: "#95a5a6", lineNumberActive: "#4e5b61", lineHighlight: "#f4f5f5", selection: "#c1e7ff",
  };
  const rules = (c) => [
    { token: "", foreground: c.text },
    { token: "identifier", foreground: c.text },
    { token: "keyword", foreground: c.type },
    { token: "keyword.type", foreground: c.type },
    { token: "type", foreground: c.type },
    { token: "keyword.control", foreground: c.control },
    { token: "keyword.directive", foreground: c.directive },
    { token: "function", foreground: c.func },
    { token: "constant", foreground: c.number },
    { token: "number", foreground: c.number },
    { token: "string", foreground: c.number },
    { token: "string.escape", foreground: c.number },
    { token: "comment", foreground: c.comment },
    { token: "delimiter", foreground: c.text },
    { token: "operator", foreground: c.text },
    { token: "delimiter.bracket", foreground: c.text },
  ];
  const theme = (base, c) => ({
    base,
    inherit: true,
    rules: rules(c),
    colors: {
      "editor.background": c.bg,
      "editorGutter.background": c.bg,
      "editor.foreground": `#${c.text}`,
      "editorLineNumber.foreground": c.lineNumber,
      "editorLineNumber.activeForeground": c.lineNumberActive,
      "editor.lineHighlightBackground": c.lineHighlight,
      "editor.selectionBackground": c.selection,
      // Sin colores por nivel de llaves (Arduino IDE no los usa).
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`editorBracketHighlight.foreground${n}`, `#${c.text}`])),
    },
  });

  window.JwsimEditorSyntax = {
    install(monaco) {
      // El C++ de Monaco se carga recién con el primer modelo «cpp» y pondría
      // su tokenizador encima del nuestro: se lo deja pasar solo al nuestro.
      const set = monaco.languages.setMonarchTokensProvider;
      try {
        monaco.languages.setMonarchTokensProvider = (id, lang) => (id === "cpp" && lang !== LANG ? { dispose() {} } : set(id, lang));
      } catch {
        /* espacio de nombres congelado: queda el C++ de Monaco */
      }
      set("cpp", LANG);
      monaco.editor.defineTheme("jwsim-dark", theme("vs-dark", DARK));
      monaco.editor.defineTheme("jwsim-light", theme("vs", LIGHT));
    },
  };
})();
