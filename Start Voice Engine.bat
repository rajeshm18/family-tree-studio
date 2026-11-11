@echo off
rem Family Tree Studio - offline voice engine (OpenAI Whisper via whisper.cpp)
rem Runs only on this PC at http://127.0.0.1:8178 . Close this window to stop it.
title Family Tree Studio - Offline Voice Engine
cd /d "%~dp0voice-engine"

set MODEL=models\ggml-large-v3-turbo-q5_0.bin
if not exist "%MODEL%" (
  echo The voice model file is missing: %CD%\%MODEL%
  echo See VOICE-SETUP.md in the Family Tree folder.
  pause
  exit /b 1
)

rem Use the NVIDIA graphics card when available (much faster), otherwise the processor.
set BIN=bin
where nvidia-smi >nul 2>nul && if exist "bin-gpu\whisper-server.exe" set BIN=bin-gpu

echo.
echo   Offline voice engine is starting (%BIN%)...
echo   Keep this window open while you use the microphone in Family Tree Studio.
echo   Close this window when you are done.
echo.
"%BIN%\whisper-server.exe" -m "%MODEL%" --host 127.0.0.1 --port 8178 -t 12 -l en -bs 5 -nt
if "%BIN%"=="bin-gpu" (
  echo.
  echo Graphics-card engine stopped or failed - starting the processor version instead...
  bin\whisper-server.exe -m "%MODEL%" --host 127.0.0.1 --port 8178 -t 16 -l en -nt
)
echo.
echo The voice engine stopped. If it closed right away, port 8178 may already be in use (it may already be running).
pause
