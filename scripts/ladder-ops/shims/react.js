// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto mínimo para empaquetar ladder-utils del OpenPLC Editor sin React.
const no = () => null
export const memo = (f) => f, useEffect = no, useState = (v) => [v, no], useMemo = (f) => f(), useRef = (v) => ({ current: v }), useCallback = (f) => f, forwardRef = (f) => f, createElement = no, Fragment = 'f', useLayoutEffect = no, useContext = no, createContext = () => ({})
export default { memo, createElement, Fragment }
export const jsx = no, jsxs = no
