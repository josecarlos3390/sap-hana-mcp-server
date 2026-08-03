#!/usr/bin/env pwsh
# Lanzador del menu de licencias para el paquete ejecutable.
# Se ubica junto a hana-mcp-server.exe.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $scriptDir 'hana-mcp-server.exe'

& $exePath --license-menu
