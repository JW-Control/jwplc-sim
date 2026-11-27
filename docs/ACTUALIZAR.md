# Actualización desde el programa

JWPLC Sim instalado en Windows se actualiza solo, como el OpenPLC Editor
(`app/lib/updater.mjs`, con electron-updater).

## Qué ve el usuario

- Unos segundos después de abrir, el Sim busca una versión nueva en las
  Releases de GitHub de `JW-Control/jwplc-sim`. Vuelve a buscar cada 6 horas.
- Si encuentra una, la descarga en segundo plano. En la barra de estado
  aparece «Descargando JWPLC Sim X · N %».
- Cuando termina, aparece el botón verde **⟳ Actualizar a X**. Al pulsarlo, el
  Sim pide guardar, se cierra, instala la versión nueva sin preguntas y se
  vuelve a abrir. Si no lo pulsa, la versión nueva se instala al cerrar el Sim.
- Desde **Herramientas ▸ Buscar actualizaciones…** se busca a mano.
- En **Herramientas ▸ Canal de actualizaciones** se elige el canal:
  - **Estable** (el predeterminado): solo recibe las Releases normales.
  - **Pruebas (versiones alpha)**: también recibe las pre-releases.
- Los proyectos, el avance del curso y las preferencias se conservan, porque
  están en los datos del usuario y no en la carpeta de instalación.
- Solo la primera descarga baja el instalador completo. Las siguientes bajan
  únicamente las partes que cambiaron, gracias al `.blockmap`.

No se actualizan solos:

- el portable (`.zip`),
- la copia del repositorio (`JWPLC Sim.bat`), que se actualiza con `git pull`,
- Linux.

Las versiones 0.5.0 y anteriores no traen el actualizador: hay que instalar a
mano la primera versión que lo trae.

## Cómo publicar una versión (PowerShell)

El workflow `dist-windows.yml` arma el instalador en GitHub y crea la Release
cuando se sube un tag `v*`. A la Release le adjunta:

- el instalador,
- `latest.yml`,
- el `.blockmap`,
- el portable.

Sin `latest.yml` la Release no se ofrece como actualización.

1. Cambie la versión en `app/package.json`:
   - estable: `0.6.0`;
   - pruebas: `0.6.0-alpha.1`, `0.6.0-alpha.2`… (con guion).
2. Haga el commit y fusione a `main` como siempre.
3. Cree y suba el tag con la misma versión:

```powershell
cd C:\Users\jeykc\Documentos\GitHub\jwplc-sim
git checkout main
git pull
git tag v0.6.0-alpha.1
git push origin v0.6.0-alpha.1
```

Un tag con guion (`v0.6.0-alpha.1`) se publica como pre-release, y solo lo
recibe el canal Pruebas. Un tag sin guion (`v0.6.0`) se publica como Release
normal, y lo reciben todos.

El tag tiene que coincidir con la versión de `app/package.json`. Si no
coinciden, la Release lleva un instalador con otro número y el Sim instalado
no la reconoce como nueva.

## Sin firma de código

El instalador no está firmado:

- La actualización funciona igual.
- En la primera instalación, Windows SmartScreen puede mostrar «Windows
  protegió su PC». Hay que pulsar **Más información ▸ Ejecutar de todas
  formas**.
- Con un certificado de firma de código, ese aviso desaparece.

## Pruebas

```powershell
cd C:\Users\jeykc\Documentos\GitHub\jwplc-sim\app
node tests/e2e-actualizar.mjs
```

La prueba levanta un servidor local que hace de Release
(`JWSIM_UPDATE_FEED=<url>`, proveedor `generic`). `JWSIM_UPDATES=0` apaga la
actualización.
