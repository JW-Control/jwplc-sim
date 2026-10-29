; SPDX-FileCopyrightText: 2026 JW Control
; SPDX-License-Identifier: GPL-3.0-or-later
; Comprobación propia de "JWPLC Sim está abierto" (instalador y desinstalador).
; La de electron-builder 26 busca cualquier proceso cuya ruta empiece por
; $INSTDIR y, si no lo puede cerrar, repite "No se puede cerrar JWPLC Sim" sin
; decir qué proceso es. Esta excluye al propio instalador/desinstalador,
; nombra los procesos que encuentra y los cierra con -Force.

!macro jwsimListInstdirProcs _DIR _OUT
  System::Call 'kernel32::GetCurrentProcessId() i .R9'
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -C "(Get-CimInstance Win32_Process | ? { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('${_DIR}\', 'OrdinalIgnoreCase') -and $$_.ProcessId -ne $R9 } | % { $$_.Name + ' (PID ' + $$_.ProcessId + ')' }) -join ', '"`
  Pop $R8
  Pop ${_OUT}
  ; Sin PowerShell (o con error) no se bloquea la instalación.
  ${if} $R8 != 0
    StrCpy ${_OUT} ""
  ${endIf}
!macroend

!macro jwsimKillInstdirProcs _DIR
  System::Call 'kernel32::GetCurrentProcessId() i .R9'
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -C "Get-CimInstance Win32_Process | ? { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('${_DIR}\', 'OrdinalIgnoreCase') -and $$_.ProcessId -ne $R9 } | % { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $R8
  Sleep 800
!macroend

!macro customCheckAppRunning
  !insertmacro jwsimListInstdirProcs "$INSTDIR" $R7
  ${if} $R7 != ""
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "JWPLC Sim tiene procesos abiertos en $INSTDIR:$\r$\n$\r$\n$R7$\r$\n$\r$\nAceptar los cierra y continúa." /SD IDOK IDOK +2
    Quit
    !insertmacro jwsimKillInstdirProcs "$INSTDIR"
    !insertmacro jwsimListInstdirProcs "$INSTDIR" $R7
    ${if} $R7 != ""
      MessageBox MB_OK|MB_ICONSTOP "No se pudieron cerrar estos procesos en $INSTDIR:$\r$\n$\r$\n$R7$\r$\n$\r$\nCiérrelos en el Administrador de tareas (pestaña Detalles) o reinicie Windows, y vuelva a ejecutar el instalador." /SD IDOK
      Quit
    ${endIf}
  ${endIf}
!macroend

; Si el desinstalador de la versión anterior falla (los instalados antes de
; esta comprobación traen la de electron-builder y salen con código 2), se
; borran sus archivos y se sigue: la instalación nueva escribe encima los
; accesos y el registro. Solo se borra una carpeta que contenga JWPLC Sim.exe.
!macro jwsimOldUninstallResult _ROOT
  ${if} ${Errors}
  ${orIf} $R0 != 0
    ReadRegStr $R6 ${_ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $R6 == ""
      StrCpy $R6 "$INSTDIR"
    ${endIf}
    DetailPrint `El desinstalador anterior falló ($R0): se borran sus archivos en $R6.`
    ${if} ${FileExists} "$R6\${APP_EXECUTABLE_FILENAME}"
      !insertmacro jwsimKillInstdirProcs "$R6"
      RMDir /r "$R6"
    ${endIf}
    ClearErrors
  ${endIf}
!macroend
!macro customUnInstallCheck
  !insertmacro jwsimOldUninstallResult SHCTX
!macroend
!macro customUnInstallCheckCurrentUser
  !insertmacro jwsimOldUninstallResult HKCU
!macroend
