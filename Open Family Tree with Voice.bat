@echo off
rem Starts the offline voice engine (minimised) and opens Family Tree Studio.
cd /d "%~dp0"
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8178/) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Family Tree Voice Engine" /min "%~dp0Start Voice Engine.bat"
start "" "%~dp0FamilyTree.html"
