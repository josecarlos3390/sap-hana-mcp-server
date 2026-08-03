@echo off
chcp 65001 >nul
setlocal

:: Change to the folder where this .bat file lives (same folder as the .exe)
cd /d "%~dp0"

if not exist ".env" (
  echo.
  echo [AVISO] No se encontro el archivo .env en: %CD%
  echo.
  echo Pasos para configurar:
  echo   1. Copia .env.example como .env
  echo   2. Edita .env y completa HANA_HOST, HANA_USER, HANA_PASSWORD y HANA_SCHEMA
  echo   3. Opcional: guarda tu token de licencia en .hana-license
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\@sap\hana-client" (
  echo.
  echo [ERROR] No se encontro el driver nativo de SAP HANA en:
  echo   %CD%\node_modules\@sap\hana-client
  echo.
  echo Verifica que descomprimiste todo el paquete distribuido.
  pause
  exit /b 1
)

echo.
echo Iniciando HANA MCP Server desde: %CD%
echo.
"%~dp0hana-mcp-server.exe"
