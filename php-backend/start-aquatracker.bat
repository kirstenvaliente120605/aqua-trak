@echo off
rem ===========================================================================
rem  AquaTracker - start both servers, then open the app.
rem
rem  Double-click this file. Safe to run more than once.
rem
rem  The real work is in start-aquatracker.ps1; this wrapper only exists so the
rem  script can be started by double-click without PowerShell's execution-policy
rem  or file-association dialogs getting in the way.
rem ===========================================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-aquatracker.ps1"

rem Keep the window open if the script failed, so the error stays readable.
if errorlevel 1 (
  echo.
  pause
)