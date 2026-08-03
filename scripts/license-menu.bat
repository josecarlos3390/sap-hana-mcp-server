@echo off
REM Lanzador del menu de licencias para el paquete ejecutable.
REM Se ubica junto a hana-mcp-server.exe.

cd /d "%~dp0"
hana-mcp-server.exe --license-menu
if errorlevel 1 pause
