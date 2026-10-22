// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_SD_DATALOG: VFS de ESP-IDF sobre la microSD (montada por el core
// en "/sd") con la API C estándar, como en un proyecto ESP-IDF, y aislamiento
// del disco de la PC. Imprime "[PASS]"/"[FAIL]" y "SD_VFS: P PASS, F FAIL".
#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

int passed = 0;
int failed = 0;

void check(bool ok, const char *what) {
  Serial.print(ok ? "[PASS] " : "[FAIL] ");
  Serial.println(what);
  (ok ? passed : failed)++;
}

void setup() {
  Serial.begin(115200);
  delay(100);
  check(JWPLC_SD.isReady(), "microSD montada por el core");

  // Escritura con stdio y lectura de vuelta.
  FILE *f = fopen("/sd/vfs.txt", "w");
  check(f != nullptr, "fopen w");
  check(fprintf(f, "linea %d\n", 1) == 8, "fprintf");
  check(fputs("linea 2\n", f) >= 0, "fputs");
  check(fwrite("xyz", 1, 3, f) == 3, "fwrite");
  check(ftell(f) == 19, "ftell con datos en el búfer");
  check(fclose(f) == 0, "fclose");

  struct stat st;
  check(stat("/sd/vfs.txt", &st) == 0 && st.st_size == 19 && S_ISREG(st.st_mode), "stat: archivo de 19 bytes");
  check(stat("/sd", &st) == 0 && S_ISDIR(st.st_mode), "stat de la raíz del montaje");

  f = fopen("/sd/vfs.txt", "r");
  char line[32];
  check(fgets(line, sizeof(line), f) && strcmp(line, "linea 1\n") == 0, "fgets primera línea");
  check(fseek(f, -3, SEEK_END) == 0 && fgetc(f) == 'x', "fseek desde el final");
  check(fread(line, 1, 10, f) == 2 && feof(f), "fread hasta el final marca EOF");
  fclose(f);

  // Agregar: siempre al final aunque se mueva el puntero.
  f = fopen("/sd/vfs.txt", "a");
  fseek(f, 0, SEEK_SET);
  fputs("!", f);
  fclose(f);
  f = fopen("/sd/vfs.txt", "r");
  fseek(f, -1, SEEK_END);
  check(fgetc(f) == '!', "modo a escribe al final");
  fclose(f);

  // Errores con errno como ESP-IDF.
  errno = 0;
  check(fopen("/sd/no_existe.txt", "r") == nullptr && errno == ENOENT, "fopen r de un archivo inexistente: ENOENT");
  check(mkdir("/sd/dir", 0777) == 0, "mkdir");
  errno = 0;
  check(mkdir("/sd/dir", 0777) == -1 && errno == EEXIST, "mkdir existente: EEXIST");
  f = fopen("/sd/dir/a.csv", "w");
  fputs("1,2\n", f);
  fclose(f);
  errno = 0;
  check(rmdir("/sd/dir") == -1 && errno != 0, "rmdir de un directorio no vacío falla");
  check(rename("/sd/dir/a.csv", "/sd/dir/b.csv") == 0, "rename");
  errno = 0;
  check(rename("/sd/vfs.txt", "/sd/dir/b.csv") == -1 && errno == EEXIST, "rename sobre un existente: EEXIST");

  DIR *d = opendir("/sd/dir");
  int entries = 0;
  bool found = false;
  while (struct dirent *e = d ? readdir(d) : nullptr) {
    entries++;
    found |= strcmp(e->d_name, "b.csv") == 0 && e->d_type == DT_REG;
  }
  if (d) closedir(d);
  check(entries == 1 && found, "opendir/readdir");
  check(unlink("/sd/dir/b.csv") == 0 && rmdir("/sd/dir") == 0, "unlink y rmdir");
  check(stat("/sd/dir", &st) == -1 && errno == ENOENT, "directorio borrado");

  // Aislamiento: fuera de los montajes no hay archivos (ni del host).
  errno = 0;
  check(fopen("/etc/hostname", "r") == nullptr && errno == ENOENT, "ruta del host: ENOENT");
  check(fopen("C:\\Windows\\win.ini", "r") == nullptr, "ruta de Windows: no existe");
  check(stat("/tmp", &st) == -1 && opendir("/") == nullptr, "stat y opendir fuera del montaje fallan");
  check(fopen("/sdx/a.txt", "w") == nullptr, "prefijo parecido a /sd no es el montaje");

  Serial.print("SD_VFS: ");
  Serial.print(passed);
  Serial.print(" PASS, ");
  Serial.print(failed);
  Serial.println(" FAIL");
}

void loop() { delay(1000); }
