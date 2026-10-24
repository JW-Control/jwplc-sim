// SPDX-FileCopyrightText: 2026 Autor
// SPDX-License-Identifier: MIT
// jwsim-cli device test .   (JWSIM_SDK apunta a sdk/testing.mjs)
import assert from "node:assert/strict";
import { test } from "node:test";

import device from "./device.mjs";

const { sceneWith, ms } = await import(process.env.JWSIM_SDK);

test("parpadea con la bobina energizada y se apaga sin ella", () => {
  const s = sceneWith(device, ["PS:power-24vdc", "S:pushbutton-no", "B:autor/mi-dispositivo"], ["PS.+V1 - S.13", "S.14 - B.X1", "B.X2 - PS.-V1"]);
  assert.equal(s.output("B", "lit"), false);
  s.act("S", "press", true, ms(100));
  assert.equal(s.output("B", "lit"), true);
  s.advanceTo(ms(600));
  assert.equal(s.output("B", "lit"), false);
  s.advanceTo(ms(1100));
  assert.equal(s.output("B", "lit"), true);
  s.act("S", "press", false, ms(1200));
  assert.equal(s.output("B", "lit"), false);
});
