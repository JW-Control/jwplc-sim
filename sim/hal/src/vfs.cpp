// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// VFS del firmware simulado (gate JWSIM_G4_SD_DATALOG).
//
// El build redirige las llamadas de archivos del firmware (sketch, core,
// librerías: fopen, fread, stat, opendir, unlink...) a estas funciones
// (sim/hal/fw-libc.syms, objcopy --redefine-syms). Las rutas bajo un punto
// de montaje registrado con esp_vfs_fat_register ("/sd") van a FatFs, con la
// semántica de vfs_fat.c de ESP-IDF (modos, O_APPEND, errno, stat). Cualquier
// otra ruta da ENOENT: el firmware nunca toca el disco del host. Los FILE *
// del host (stdout, stderr) pasan a la libc real.
//
// stdio: como newlib, cada archivo tiene un búfer (128 bytes por defecto;
// vfs_api.cpp de arduino-esp32 pide 4096 con setvbuf) que se vuelca a
// f_write al llenarse, en fflush, fseek y fclose.
#include <cerrno>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <set>
#include <string>
#include <vector>

#include <dirent.h>
#include <fcntl.h>
#include <sys/stat.h>

#include "esp_vfs_fat.h"
#include "ff.h"

// Montajes registrados por vfs_fat.cpp.
extern "C" bool jwsim_vfs_resolve(const char *path, char *fat_path, size_t len, const char **base, size_t *max_files);

namespace {

constexpr int kFdBase = 1000;
constexpr size_t kDefaultBuf = 128;   // BUFSIZ de newlib en ESP-IDF
constexpr unsigned kFileMagic = 0x4A574646;
constexpr unsigned kDirMagic = 0x4A574444;

struct VfsFile {
  unsigned magic = kFileMagic;
  FIL fil{};
  std::string base;
  bool readable = false, writable = false, append = false;
  std::vector<uint8_t> buf;
  size_t bufsize = kDefaultBuf;
  bool unbuffered = false;
  enum class Mode { None, Read, Write } mode = Mode::None;
  size_t rpos = 0, rlen = 0;   // búfer de lectura
  size_t wlen = 0;             // bytes pendientes de escritura
  bool eof = false, err = false;
  int fd = -1;
};

struct VfsDir {
  unsigned magic = kDirMagic;
  FF_DIR dir{};
  std::string fat_path;
  struct dirent ent{};
  long pos = 0;
};

std::set<VfsFile *> g_files;
std::set<VfsDir *> g_dirs;
std::vector<VfsFile *> g_fds;   // fd - kFdBase → archivo

VfsFile *as_vfs(FILE *f) {
  auto *v = reinterpret_cast<VfsFile *>(f);
  return g_files.count(v) ? v : nullptr;
}
VfsDir *as_dir(DIR *d) {
  auto *v = reinterpret_cast<VfsDir *>(d);
  return g_dirs.count(v) ? v : nullptr;
}
VfsFile *by_fd(int fd) {
  const int i = fd - kFdBase;
  return i >= 0 && i < static_cast<int>(g_fds.size()) ? g_fds[i] : nullptr;
}

// fresult_to_errno de vfs_fat.c.
int fr_errno(FRESULT r) {
  switch (r) {
    case FR_DISK_ERR: return EIO;
    case FR_INT_ERR: return EIO;
    case FR_NOT_READY: return ENODEV;
    case FR_NO_FILE: return ENOENT;
    case FR_NO_PATH: return ENOENT;
    case FR_INVALID_NAME: return EINVAL;
    case FR_DENIED: return EACCES;
    case FR_EXIST: return EEXIST;
    case FR_INVALID_OBJECT: return EBADF;
    case FR_WRITE_PROTECTED: return EROFS;
    case FR_INVALID_DRIVE: return ENXIO;
    case FR_NOT_ENABLED: return ENODEV;
    case FR_NO_FILESYSTEM: return ENODEV;
    case FR_MKFS_ABORTED: return EINTR;
    case FR_TIMEOUT: return ETIMEDOUT;
    case FR_LOCKED: return EACCES;
    case FR_NOT_ENOUGH_CORE: return ENOMEM;
    case FR_TOO_MANY_OPEN_FILES: return ENFILE;
    case FR_INVALID_PARAMETER: return EINVAL;
    case FR_OK: return 0;
  }
  return EIO;
}

int fail(int e) {
  errno = e;
  return -1;
}

// Ruta FatFs ("0:/a/b") de una ruta del firmware ("/sd/a/b").
bool resolve(const char *path, std::string &fat, std::string *base = nullptr, size_t *max_files = nullptr) {
  if (!path) return false;
  char buf[512];
  const char *b = nullptr;
  size_t mf = 0;
  if (!jwsim_vfs_resolve(path, buf, sizeof(buf), &b, &mf)) return false;
  fat = buf;
  if (base) *base = b;
  if (max_files) *max_files = mf;
  return true;
}

bool is_root(const std::string &fat) {
  const auto colon = fat.find(':');
  const std::string rest = fat.substr(colon == std::string::npos ? 0 : colon + 1);
  return rest.empty() || rest == "/";
}

time_t fat_time(WORD fdate, WORD ftime) {
  struct tm tm{};
  tm.tm_mday = fdate & 0x1F;
  tm.tm_mon = ((fdate >> 5) & 0x0F) - 1;
  tm.tm_year = (fdate >> 9) + 80;
  tm.tm_sec = (ftime & 0x1F) * 2;
  tm.tm_min = (ftime >> 5) & 0x3F;
  tm.tm_hour = (ftime >> 11) & 0x1F;
  tm.tm_isdst = -1;
  return mktime(&tm);
}

// ------------------------------------------------------------------ búfer
bool flush_write(VfsFile *v) {
  if (v->mode != VfsFile::Mode::Write || v->wlen == 0) return true;
  if (v->append) f_lseek(&v->fil, f_size(&v->fil));
  UINT done = 0;
  const FRESULT r = f_write(&v->fil, v->buf.data(), static_cast<UINT>(v->wlen), &done);
  const bool ok = r == FR_OK && done == v->wlen;
  v->wlen = 0;
  if (!ok) {
    v->err = true;
    errno = r == FR_OK ? ENOSPC : fr_errno(r);
  }
  return ok;
}

// Descarta el búfer de lectura y deja FatFs en la posición lógica.
void drop_read(VfsFile *v) {
  if (v->mode != VfsFile::Mode::Read) return;
  const FSIZE_t logical = f_tell(&v->fil) - (v->rlen - v->rpos);
  f_lseek(&v->fil, logical);
  v->rpos = v->rlen = 0;
}

bool sync_out(VfsFile *v) {
  const bool ok = flush_write(v);
  drop_read(v);
  v->mode = VfsFile::Mode::None;
  return ok;
}

size_t vfs_read(VfsFile *v, void *dst, size_t n) {
  if (!v->readable) {
    v->err = true;
    errno = EBADF;
    return 0;
  }
  if (v->mode == VfsFile::Mode::Write) sync_out(v);
  v->mode = VfsFile::Mode::Read;
  auto *out = static_cast<uint8_t *>(dst);
  size_t got = 0;
  while (got < n) {
    if (v->rpos == v->rlen) {
      if (v->buf.size() < v->bufsize) v->buf.resize(v->bufsize);
      UINT r = 0;
      const FRESULT res = f_read(&v->fil, v->buf.data(), static_cast<UINT>(v->unbuffered ? 1 : v->bufsize), &r);
      v->rpos = 0;
      v->rlen = r;
      if (res != FR_OK) {
        v->err = true;
        errno = fr_errno(res);
        break;
      }
      if (r == 0) {
        v->eof = true;
        break;
      }
    }
    const size_t k = std::min(n - got, v->rlen - v->rpos);
    std::memcpy(out + got, v->buf.data() + v->rpos, k);
    v->rpos += k;
    got += k;
  }
  return got;
}

size_t vfs_write(VfsFile *v, const void *src, size_t n) {
  if (!v->writable) {
    v->err = true;
    errno = EBADF;
    return 0;
  }
  if (v->mode == VfsFile::Mode::Read) sync_out(v);
  v->mode = VfsFile::Mode::Write;
  const auto *in = static_cast<const uint8_t *>(src);
  if (v->unbuffered) {
    if (v->append) f_lseek(&v->fil, f_size(&v->fil));
    UINT done = 0;
    const FRESULT r = f_write(&v->fil, in, static_cast<UINT>(n), &done);
    if (r != FR_OK || done != n) {
      v->err = true;
      errno = r == FR_OK ? ENOSPC : fr_errno(r);
    }
    return done;
  }
  if (v->buf.size() < v->bufsize) v->buf.resize(v->bufsize);
  size_t put = 0;
  while (put < n) {
    const size_t k = std::min(n - put, v->bufsize - v->wlen);
    std::memcpy(v->buf.data() + v->wlen, in + put, k);
    v->wlen += k;
    put += k;
    if (v->wlen == v->bufsize && !flush_write(v)) return put - k;
  }
  return put;
}

FSIZE_t logical_pos(VfsFile *v) {
  FSIZE_t p = f_tell(&v->fil);
  if (v->mode == VfsFile::Mode::Read) p -= v->rlen - v->rpos;
  if (v->mode == VfsFile::Mode::Write) p = (v->append ? f_size(&v->fil) : p) + v->wlen;
  return p;
}

void fill_stat(struct stat *st, bool dir, FSIZE_t size, time_t mtime) {
  std::memset(st, 0, sizeof(*st));
  st->st_mode = (dir ? S_IFDIR : S_IFREG) | 0777;
  st->st_size = static_cast<decltype(st->st_size)>(size);
  st->st_mtime = mtime;
  st->st_atime = mtime;
  st->st_ctime = mtime;
}

} // namespace

extern "C" {

// ------------------------------------------------------------------ stdio
FILE *jwsim_vfs_fopen(const char *path, const char *mode) {
  std::string fat, base;
  size_t max_files = 0;
  if (!resolve(path, fat, &base, &max_files) || !mode) {
    errno = ENOENT;
    return nullptr;
  }
  // Flags de newlib (__sflags) → modo FatFs (fat_mode_conv de vfs_fat.c).
  int oflags = 0;
  switch (mode[0]) {
    case 'r': oflags = O_RDONLY; break;
    case 'w': oflags = O_WRONLY | O_CREAT | O_TRUNC; break;
    case 'a': oflags = O_WRONLY | O_CREAT | O_APPEND; break;
    default: errno = EINVAL; return nullptr;
  }
  for (const char *m = mode + 1; *m; ++m) {
    if (*m == '+') oflags = (oflags & ~O_ACCMODE) | O_RDWR;
    if (*m == 'x') oflags |= O_EXCL;
  }
  BYTE fa = 0;
  const int acc = oflags & O_ACCMODE;
  fa |= acc == O_RDONLY ? FA_READ : acc == O_WRONLY ? FA_WRITE : FA_READ | FA_WRITE;
  if ((oflags & O_CREAT) && (oflags & O_EXCL)) fa |= FA_CREATE_NEW;
  else if ((oflags & O_CREAT) && (oflags & O_TRUNC)) fa |= FA_CREATE_ALWAYS;
  else if (oflags & O_APPEND) fa |= FA_OPEN_ALWAYS;
  else fa |= FA_OPEN_EXISTING;

  size_t open_here = 0;
  for (VfsFile *f : g_files) open_here += f->base == base;
  if (open_here >= max_files) {
    errno = ENFILE;
    return nullptr;
  }
  auto *v = new VfsFile;
  const FRESULT r = f_open(&v->fil, fat.c_str(), fa);
  if (r != FR_OK) {
    delete v;
    errno = fr_errno(r);
    return nullptr;
  }
  v->base = base;
  v->readable = acc != O_WRONLY;
  v->writable = acc != O_RDONLY;
  v->append = oflags & O_APPEND;
  size_t slot = 0;
  while (slot < g_fds.size() && g_fds[slot]) ++slot;
  if (slot == g_fds.size()) g_fds.push_back(nullptr);
  g_fds[slot] = v;
  v->fd = kFdBase + static_cast<int>(slot);
  g_files.insert(v);
  return reinterpret_cast<FILE *>(v);
}

int jwsim_vfs_fclose(FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fclose(f);
  const bool ok = flush_write(v);
  const FRESULT r = f_close(&v->fil);
  g_fds[v->fd - kFdBase] = nullptr;
  g_files.erase(v);
  delete v;
  if (r != FR_OK) return fail(fr_errno(r));
  return ok ? 0 : EOF;
}

size_t jwsim_vfs_fread(void *p, size_t size, size_t n, FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fread(p, size, n, f);
  if (!size || !n) return 0;
  return vfs_read(v, p, size * n) / size;
}
size_t jwsim_vfs___fread_chk(void *p, size_t, size_t size, size_t n, FILE *f) { return jwsim_vfs_fread(p, size, n, f); }

size_t jwsim_vfs_fwrite(const void *p, size_t size, size_t n, FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fwrite(p, size, n, f);
  if (!size || !n) return 0;
  return vfs_write(v, p, size * n) / size;
}

int jwsim_vfs_fflush(FILE *f) {
  if (!f) return std::fflush(nullptr);
  VfsFile *v = as_vfs(f);
  if (!v) return std::fflush(f);
  return sync_out(v) ? 0 : EOF;
}

int jwsim_vfs_fseek(FILE *f, long off, int whence) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fseek(f, off, whence);
  const FSIZE_t cur = logical_pos(v);
  if (!sync_out(v)) return -1;
  long long pos = off;
  if (whence == SEEK_CUR) pos += static_cast<long long>(cur);
  else if (whence == SEEK_END) pos += static_cast<long long>(f_size(&v->fil));
  else if (whence != SEEK_SET) return fail(EINVAL);
  if (pos < 0) return fail(EINVAL);
  const FRESULT r = f_lseek(&v->fil, static_cast<FSIZE_t>(pos));
  if (r != FR_OK) return fail(fr_errno(r));
  v->eof = false;
  return 0;
}

long jwsim_vfs_ftell(FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::ftell(f);
  return static_cast<long>(logical_pos(v));
}

void jwsim_vfs_rewind(FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::rewind(f);
  jwsim_vfs_fseek(f, 0, SEEK_SET);
  v->err = false;
}

int jwsim_vfs_fileno(FILE *f) {
  VfsFile *v = as_vfs(f);
  return v ? v->fd : fileno(f);
}

int jwsim_vfs_setvbuf(FILE *f, char *, int mode, size_t size) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::setvbuf(f, nullptr, mode, size);
  if (v->mode != VfsFile::Mode::None) return EOF;   // solo antes de la primera E/S
  v->unbuffered = mode == _IONBF;
  if (size) v->bufsize = size;
  return 0;
}
void jwsim_vfs_setbuf(FILE *f, char *b) { jwsim_vfs_setvbuf(f, b, b ? _IOFBF : _IONBF, 0); }

int jwsim_vfs_feof(FILE *f) {
  VfsFile *v = as_vfs(f);
  return v ? v->eof : std::feof(f);
}
int jwsim_vfs_ferror(FILE *f) {
  VfsFile *v = as_vfs(f);
  return v ? v->err : std::ferror(f);
}
void jwsim_vfs_clearerr(FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::clearerr(f);
  v->eof = v->err = false;
}

int jwsim_vfs_fgetc(FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fgetc(f);
  unsigned char c;
  return vfs_read(v, &c, 1) == 1 ? c : EOF;
}
int jwsim_vfs_fputc(int c, FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fputc(c, f);
  const unsigned char b = static_cast<unsigned char>(c);
  return vfs_write(v, &b, 1) == 1 ? b : EOF;
}
char *jwsim_vfs_fgets(char *s, int n, FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fgets(s, n, f);
  if (n <= 0) return nullptr;
  int i = 0;
  while (i < n - 1) {
    unsigned char c;
    if (vfs_read(v, &c, 1) != 1) break;
    s[i++] = static_cast<char>(c);
    if (c == '\n') break;
  }
  if (i == 0) return nullptr;
  s[i] = 0;
  return s;
}
char *jwsim_vfs___fgets_chk(char *s, size_t, int n, FILE *f) { return jwsim_vfs_fgets(s, n, f); }
int jwsim_vfs_fputs(const char *s, FILE *f) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::fputs(s, f);
  const size_t n = std::strlen(s);
  return vfs_write(v, s, n) == n ? 0 : EOF;
}
int jwsim_vfs_vfprintf(FILE *f, const char *fmt, va_list ap) {
  VfsFile *v = as_vfs(f);
  if (!v) return std::vfprintf(f, fmt, ap);
  va_list aq;
  va_copy(aq, ap);
  const int n = std::vsnprintf(nullptr, 0, fmt, aq);
  va_end(aq);
  if (n < 0) return n;
  std::string s(static_cast<size_t>(n) + 1, '\0');
  std::vsnprintf(s.data(), s.size(), fmt, ap);
  return vfs_write(v, s.data(), static_cast<size_t>(n)) == static_cast<size_t>(n) ? n : -1;
}
int jwsim_vfs_fprintf(FILE *f, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  const int n = jwsim_vfs_vfprintf(f, fmt, ap);
  va_end(ap);
  return n;
}
int jwsim_vfs___vfprintf_chk(FILE *f, int, const char *fmt, va_list ap) { return jwsim_vfs_vfprintf(f, fmt, ap); }
int jwsim_vfs___fprintf_chk(FILE *f, int, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  const int n = jwsim_vfs_vfprintf(f, fmt, ap);
  va_end(ap);
  return n;
}

// ------------------------------------------------------------------ descriptores
int jwsim_vfs_fsync(int fd) {
  VfsFile *v = by_fd(fd);
  if (!v) return fail(EBADF);
  if (!flush_write(v)) return -1;
  const FRESULT r = f_sync(&v->fil);
  return r == FR_OK ? 0 : fail(fr_errno(r));
}

int jwsim_vfs_fstat(int fd, struct stat *st) {
  VfsFile *v = by_fd(fd);
  if (!v) return fail(EBADF);
  fill_stat(st, false, f_size(&v->fil), 0);
  return 0;
}

// ------------------------------------------------------------------ rutas
int jwsim_vfs_stat(const char *path, struct stat *st) {
  std::string fat;
  if (!resolve(path, fat)) return fail(ENOENT);
  if (is_root(fat)) {
    fill_stat(st, true, 0, 0);
    return 0;
  }
  FILINFO info{};
  const FRESULT r = f_stat(fat.c_str(), &info);
  if (r != FR_OK) return fail(fr_errno(r));
  fill_stat(st, info.fattrib & AM_DIR, info.fsize, fat_time(info.fdate, info.ftime));
  return 0;
}

int jwsim_vfs_access(const char *path, int) {
  struct stat st;
  return jwsim_vfs_stat(path, &st);
}

int jwsim_vfs_unlink(const char *path) {
  std::string fat;
  if (!resolve(path, fat)) return fail(ENOENT);
  const FRESULT r = f_unlink(fat.c_str());
  return r == FR_OK ? 0 : fail(fr_errno(r));
}
int jwsim_vfs_remove(const char *path) { return jwsim_vfs_unlink(path); }

int jwsim_vfs_rename(const char *from, const char *to) {
  std::string a, b, base_a, base_b;
  if (!resolve(from, a, &base_a) || !resolve(to, b, &base_b)) return fail(ENOENT);
  if (base_a != base_b) return fail(EXDEV);
  // FatFs espera la ruta de destino sin unidad.
  const auto colon = b.find(':');
  const FRESULT r = f_rename(a.c_str(), b.c_str() + (colon == std::string::npos ? 0 : colon + 1));
  return r == FR_OK ? 0 : fail(fr_errno(r));
}

int jwsim_vfs_mkdir(const char *path, unsigned) {
  std::string fat;
  if (!resolve(path, fat)) return fail(ENOENT);
  const FRESULT r = f_mkdir(fat.c_str());
  return r == FR_OK ? 0 : fail(fr_errno(r));
}
int jwsim_vfs__mkdir(const char *path) { return jwsim_vfs_mkdir(path, 0777); }   // MinGW

int jwsim_vfs_rmdir(const char *path) {
  std::string fat;
  if (!resolve(path, fat)) return fail(ENOENT);
  FILINFO info{};
  FRESULT r = f_stat(fat.c_str(), &info);
  if (r != FR_OK) return fail(fr_errno(r));
  if (!(info.fattrib & AM_DIR)) return fail(ENOTDIR);
  r = f_unlink(fat.c_str());
  return r == FR_OK ? 0 : fail(fr_errno(r));
}

// ------------------------------------------------------------------ directorios
DIR *jwsim_vfs_opendir(const char *path) {
  std::string fat;
  if (!resolve(path, fat)) {
    errno = ENOENT;
    return nullptr;
  }
  auto *d = new VfsDir;
  const FRESULT r = f_opendir(&d->dir, fat.c_str());
  if (r != FR_OK) {
    delete d;
    errno = fr_errno(r);
    return nullptr;
  }
  d->fat_path = fat;
  g_dirs.insert(d);
  return reinterpret_cast<DIR *>(d);
}

struct dirent *jwsim_vfs_readdir(DIR *dir) {
  VfsDir *d = as_dir(dir);
  if (!d) {
    errno = EBADF;
    return nullptr;
  }
  FILINFO info{};
  const FRESULT r = f_readdir(&d->dir, &info);
  if (r != FR_OK) {
    errno = fr_errno(r);
    return nullptr;
  }
  if (!info.fname[0]) return nullptr;
  ++d->pos;
  d->ent.d_ino = 0;
  d->ent.d_type = (info.fattrib & AM_DIR) ? DT_DIR : DT_REG;
  std::strncpy(d->ent.d_name, info.fname, sizeof(d->ent.d_name) - 1);
  d->ent.d_name[sizeof(d->ent.d_name) - 1] = 0;
  return &d->ent;
}

int jwsim_vfs_closedir(DIR *dir) {
  VfsDir *d = as_dir(dir);
  if (!d) return fail(EBADF);
  f_closedir(&d->dir);
  g_dirs.erase(d);
  delete d;
  return 0;
}

void jwsim_vfs_rewinddir(DIR *dir) {
  VfsDir *d = as_dir(dir);
  if (!d) return;
  f_readdir(&d->dir, nullptr);
  d->pos = 0;
}

long jwsim_vfs_telldir(DIR *dir) {
  VfsDir *d = as_dir(dir);
  return d ? d->pos : -1;
}

void jwsim_vfs_seekdir(DIR *dir, long loc) {
  VfsDir *d = as_dir(dir);
  if (!d) return;
  jwsim_vfs_rewinddir(dir);
  FILINFO info{};
  while (d->pos < loc && f_readdir(&d->dir, &info) == FR_OK && info.fname[0]) ++d->pos;
}

// ------------------------------------------------------------------ alias
// Otros nombres de las mismas funciones (glibc, MinGW): objcopy redirige cada
// símbolo a un nombre propio (sim/hal/fw-libc.syms).
int jwsim_vfs_fseeko(FILE *f, long off, int whence) { return jwsim_vfs_fseek(f, off, whence); }
long jwsim_vfs_ftello(FILE *f) { return jwsim_vfs_ftell(f); }
int jwsim_vfs_getc(FILE *f) { return jwsim_vfs_fgetc(f); }
int jwsim_vfs__IO_getc(FILE *f) { return jwsim_vfs_fgetc(f); }
int jwsim_vfs_putc(int c, FILE *f) { return jwsim_vfs_fputc(c, f); }
int jwsim_vfs__IO_putc(int c, FILE *f) { return jwsim_vfs_fputc(c, f); }
int jwsim_vfs___mingw_vfprintf(FILE *f, const char *fmt, va_list ap) { return jwsim_vfs_vfprintf(f, fmt, ap); }
int jwsim_vfs___mingw_fprintf(FILE *f, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  const int n = jwsim_vfs_vfprintf(f, fmt, ap);
  va_end(ap);
  return n;
}
int jwsim_vfs_lstat(const char *path, struct stat *st) { return jwsim_vfs_stat(path, st); }
int jwsim_vfs__unlink(const char *path) { return jwsim_vfs_unlink(path); }
int jwsim_vfs__rmdir(const char *path) { return jwsim_vfs_rmdir(path); }
int jwsim_vfs__access(const char *path, int mode) { return jwsim_vfs_access(path, mode); }

} // extern "C"
