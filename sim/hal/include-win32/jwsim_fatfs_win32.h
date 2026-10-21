// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Inclusión forzada (-include) en las unidades FatFs/SD/FS para Windows: hace
// que ff.h pase por el envoltorio include-win32/ff.h antes de que FatFs se
// incluya a sí mismo con comillas.
#pragma once
#include <ff.h>
