// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// dirent estilo newlib (con d_type), servido por el VFS del simulador.
#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define DT_UNKNOWN 0
#define DT_REG 1
#define DT_DIR 2
struct dirent {
  uint16_t d_ino;
  uint8_t d_type;
  char d_name[256];
};
typedef struct jwsim_dir DIR;
DIR *opendir(const char *name) __asm__("jwsim_vfs_opendir");
struct dirent *readdir(DIR *dir) __asm__("jwsim_vfs_readdir");
int closedir(DIR *dir) __asm__("jwsim_vfs_closedir");
void rewinddir(DIR *dir) __asm__("jwsim_vfs_rewinddir");
long telldir(DIR *dir) __asm__("jwsim_vfs_telldir");
void seekdir(DIR *dir, long loc) __asm__("jwsim_vfs_seekdir");
#ifdef __cplusplus
}
#endif
