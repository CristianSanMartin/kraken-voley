@echo off
title Kraken Voley - Actualizar
echo.
echo   Buscando el actualizador mas reciente...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; $f=Join-Path $env:TEMP 'kraken_actualizar.ps1'; try { Invoke-WebRequest -UseBasicParsing -Uri ('https://raw.githubusercontent.com/CristianSanMartin/kraken-voley/main/actualizar.ps1?t='+[DateTime]::Now.Ticks) -OutFile $f } catch { Write-Host '  [!] Sin conexion con GitHub.' -ForegroundColor Red; exit 1 }; & $f"
echo.
pause
