// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Sustituto mínimo para empaquetar ladder-utils del OpenPLC Editor sin React.
export const Position = { Left: 'left', Top: 'top', Right: 'right', Bottom: 'bottom' }
export const MarkerType = { Arrow: 'arrow', ArrowClosed: 'arrowclosed' }
const no = () => { throw new Error('React Flow no disponible en el Sim') }
export const useUpdateNodeInternals = no, useReactFlow = no, Handle = no, useNodesInitialized = no
export default {}
