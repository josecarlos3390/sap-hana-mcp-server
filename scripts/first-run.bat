@echo off
REM Lanzador de la configuración inicial guiada para el paquete ejecutable.

cd /d "%~dp0"
hana-mcp-server.exe --first-run
if errorlevel 1 pause
