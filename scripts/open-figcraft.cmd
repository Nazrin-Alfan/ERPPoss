@echo off
setlocal
for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
set "FIGCRAFT_FILE=%REPO_ROOT%\design-system\RelayPOS-Rebrand.figcraft"

if exist "%FIGCRAFT_FILE%" (
  start "" "C:\Program Files\FigCraft\figcraft.exe" --control 7979 --automation-write-root "%REPO_ROOT%" --automation-write-root "%USERPROFILE%\Documents" "%FIGCRAFT_FILE%"
) else (
  start "" "C:\Program Files\FigCraft\figcraft.exe" --control 7979 --automation-write-root "%REPO_ROOT%" --automation-write-root "%USERPROFILE%\Documents"
)
