// Inclusión forzada (-include) en las unidades FatFs/SD/FS para Windows: hace
// que ff.h pase por el envoltorio include-win32/ff.h antes de que FatFs se
// incluya a sí mismo con comillas.
#pragma once
#include <ff.h>
