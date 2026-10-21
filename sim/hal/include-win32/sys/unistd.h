// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <unistd.h>
#include <io.h>
#ifdef __cplusplus
extern "C" {
#endif
int jwsim_vfs_fsync(int fd);
#ifdef __cplusplus
}
#endif
#define fsync(fd) jwsim_vfs_fsync(fd)
