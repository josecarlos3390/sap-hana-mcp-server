#!/usr/bin/env pwsh
# Lanzador de la configuración inicial guiada para el paquete ejecutable.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $scriptDir 'hana-mcp-server.exe'

& $exePath --first-run
