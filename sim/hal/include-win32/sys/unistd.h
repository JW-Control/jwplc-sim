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
