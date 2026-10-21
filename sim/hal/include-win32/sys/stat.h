// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// struct stat estilo newlib (con st_blksize) para el código del package.
#pragma once
#include_next <sys/stat.h>
#include <stdint.h>
#include <time.h>
#ifndef ACCESSPERMS
#define ACCESSPERMS 0777
#endif
#ifndef S_ISREG
#define S_ISREG(m) (((m) & S_IFMT) == S_IFREG)
#endif
#ifndef S_ISDIR
#define S_ISDIR(m) (((m) & S_IFMT) == S_IFDIR)
#endif
struct jwsim_stat {
  uint32_t st_dev;
  uint32_t st_ino;
  uint32_t st_mode;
  uint32_t st_nlink;
  uint32_t st_uid;
  uint32_t st_gid;
  uint32_t st_rdev;
  int64_t st_size;
  time_t st_atime;
  time_t st_mtime;
  time_t st_ctime;
  int32_t st_blksize;
  int32_t st_blocks;
};
#ifdef __cplusplus
extern "C" {
#endif
int jwsim_stat(const char *path, struct jwsim_stat *st) __asm__("jwsim_vfs_stat");
int jwsim_fstat(int fd, struct jwsim_stat *st) __asm__("jwsim_vfs_fstat");
int jwsim_vfs_mkdir(const char *path, unsigned mode);
#ifdef __cplusplus
}
// mkdir(path, mode) de newlib como sobrecarga C++ (MinGW solo tiene mkdir(path)).
extern "C++" inline int mkdir(const char *path, unsigned mode) { return jwsim_vfs_mkdir(path, mode); }
#endif
#define stat jwsim_stat
#define fstat jwsim_fstat
