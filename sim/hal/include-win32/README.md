# include-win32

Capa de compatibilidad newlib/POSIX para el destino Windows (MinGW-w64 GCC). Se antepone al include path **solo** al compilar para Windows.

El código del package (FS, SD) y FatFs de ESP-IDF asumen la libc newlib del
toolchain xtensa: `dirent.d_type`, `stat.st_blksize`, `fsync`, `MAX()` en
`sys/param.h`, `mkdir(path, mode)`. MinGW no los ofrece. Estos headers los
proveen sin modificar el package; las funciones de archivos quedan
enrutadas al VFS del simulador (`sim/hal/src/posix_vfs_win32.cpp`), nunca
al disco del host.
