@echo off
setlocal EnableDelayedExpansion

set "PROJECT_DIR=%~dp0"
set "PORT=4500"
cd /d "%PROJECT_DIR%"

if not exist "%USERPROFILE%\.bun\bin\bun.exe" (
  echo [erro] Bun nao encontrado em "%USERPROFILE%\.bun\bin\bun.exe"
  echo [dica] Instale o Bun e tente novamente.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [erro] Arquivo .env nao encontrado.
  echo [dica] Copie .env.example para .env e preencha suas chaves.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [info] Dependencias nao encontradas. Rodando bun install...
  call "%USERPROFILE%\.bun\bin\bun.exe" install
  if errorlevel 1 (
    echo [erro] Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

set "PORT_PIDS="
for /f %%i in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) 2>$null"') do (
  if not "%%i"=="" set "PORT_PIDS=!PORT_PIDS! %%i"
)

if defined PORT_PIDS (
  echo [info] Porta %PORT% em uso. Encerrando processos:%PORT_PIDS%
  powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $pids) { try { Stop-Process -Id $processId -Force -ErrorAction Stop } catch {} }" >nul 2>&1

  for /L %%n in (1,1,10) do (
    set "PORT_PIDS="
    for /f %%i in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) 2>$null"') do (
      if not "%%i"=="" set "PORT_PIDS=!PORT_PIDS! %%i"
    )
    if not defined PORT_PIDS goto :port_free
    timeout /t 1 /nobreak >nul
  )

  if defined PORT_PIDS (
    echo [erro] Nao foi possivel liberar a porta %PORT%.
    echo [dica] Finalize manualmente os processos:%PORT_PIDS%
    pause
    exit /b 1
  )
)

:port_free
echo [info] Iniciando bun-theclawbay em http://localhost:%PORT%
call "%USERPROFILE%\.bun\bin\bun.exe" run index.ts

if errorlevel 1 (
  echo.
  echo [erro] O servidor foi encerrado com erro.
  pause
  exit /b 1
)

endlocal
