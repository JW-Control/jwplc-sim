// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Funciones POSIX estilo newlib para el destino Windows (ver
// sim/hal/include-win32/README.md). En G0 no hay sistemas de archivos
// simulados montados: todo responde ENOENT. G4 (SD_DATALOG) enruta estas
// llamadas y fopen/rename/remove/unlink/rmdir a FatFs sobre el modelo de
// tarjeta SD.
#if defined(_WIN32)

#include <cerrno>
#include <cstring>

#include <dirent.h>
#include <sys/stat.h>

extern "C" {

DIR *jwsim_vfs_opendir(const char *) {
  errno = ENOENT;
  return nullptr;
}
struct dirent *jwsim_vfs_readdir(DIR *) { return nullptr; }
int jwsim_vfs_closedir(DIR *) { return 0; }
void jwsim_vfs_rewinddir(DIR *) {}
long jwsim_vfs_telldir(DIR *) { return 0; }
void jwsim_vfs_seekdir(DIR *, long) {}

int jwsim_vfs_stat(const char *, struct jwsim_stat *st) {
  if (st) std::memset(st, 0, sizeof(*st));
  errno = ENOENT;
  return -1;
}
int jwsim_vfs_fstat(int, struct jwsim_stat *st) {
  if (st) std::memset(st, 0, sizeof(*st));
  errno = EBADF;
  return -1;
}
int jwsim_vfs_fsync(int) { return 0; }

int jwsim_vfs_mkdir(const char *, unsigned) {
  errno = ENOENT;
  return -1;
}

} // extern "C"

#endif
