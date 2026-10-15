@echo off
rem ============================================================
rem  Nav site - Commit & Publish
rem  Double-click this file. All messages are printed by
rem  scripts\publish.js (pure ASCII wrapper on purpose:
rem  avoids Windows codepage issues)
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_EXE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
if not defined NODE_EXE for %%i in (node.exe) do if not "%%~$PATH:i"=="" set "NODE_EXE=%%~$PATH:i"

if not defined NODE_EXE goto nonode

"%NODE_EXE%" "%~dp0scripts\publish.js"
goto done

:nonode
echo.
echo   [ERROR] node.exe not found on this computer.
echo   Please install Node.js first: https://nodejs.org
echo.

:done
echo.
pause
