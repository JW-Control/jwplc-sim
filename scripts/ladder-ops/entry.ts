// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Lo que el Sim toma del OpenPLC Editor para editar Ladder: las mismas
// operaciones de peldaño que usa su editor (ladder-utils), sin React Flow.
// scripts/fetch-editor.mjs lo empaqueta en deps/ladder-ops.cjs.
// También lleva el cliente del depurador (abajo).
export { addNewElement, removeElements, removeElement } from '@root/frontend/components/_molecules/graphical-editor/ladder/rung/ladder-utils/elements'
export { renderPlaceholderElements, removePlaceholderElements } from '@root/frontend/components/_molecules/graphical-editor/ladder/rung/ladder-utils/elements/placeholder'
export { updateDiagramElementsPosition, changeRailBounds } from '@root/frontend/components/_molecules/graphical-editor/ladder/rung/ladder-utils/elements/diagram'
export { toastLog } from '@root/frontend/utils/toast'
export { nodesBuilder, defaultCustomNodesStyles } from '@root/frontend/components/_atoms/graphical-editor/ladder/node-builders'
export { stlibsToSystemLibraries } from '@root/frontend/utils/stlib-to-system-library'
// Depurador: el mismo protocolo (PDU Modbus con FC 0x41-0x4B) y la misma
// decodificación de respuestas que usa el editor para depurar en vivo.
export { buildGetMd5Request, parseGetMd5Response, buildGetListRequest, parseGetListResponse, buildSetVariableRequest, parseSetVariableResponse, buildGetStatusRequest, parseGetStatusResponse } from '@root/backend/shared/debug/modbus-pdu'
export { parseDebugMap, buildLeafInfoMap, packDebugAddr } from '@root/frontend/utils/debug-parser'
export { decodeVariableValues, normaliseValue, encodeValue } from '@root/cli/debug/variables'
export { debugProfileFor } from '@root/frontend/utils/debug-medium-profile'
