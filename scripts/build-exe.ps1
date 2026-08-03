#!/usr/bin/env pwsh

<#
.SYNOPSIS
  Build a Windows single-executable (.exe) distribution of the HANA MCP Server.

.DESCRIPTION
  Uses `pkg` to bundle the JavaScript into a single Windows x64 executable.
  The native @sap/hana-client binary is included as an asset so the .exe can
  run on machines without Node.js installed.

  Output: dist/hana-mcp-server-exe/
    hana-mcp-server.exe          # Bundled Node.js application
    docs/kb/                     # Local knowledge-base cases
    public-key.pem               # License public key (also embedded)
    LICENSE, .env.example, ...
    scripts/license-menu.js      # Interactive license menu
    license-menu.bat / .ps1      # Launchers for the license menu
    scripts/update-client.ps1    # Updater helpers for hana_apply_update
    scripts/update-client.sh

  The resulting folder can be zipped and distributed to clients.
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$outDir = Join-Path $dist 'hana-mcp-server-exe'
$version = (Get-Content (Join-Path $root 'package.json') | ConvertFrom-Json).version

Write-Host "Building HANA MCP Server v$version executable..." -ForegroundColor Cyan

# Clean / create output directory
if (Test-Path $outDir) {
  Remove-Item -Path $outDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# Build the executable using pkg (configuration lives in package.json)
Write-Host "Running pkg..."
& npx pkg .
if (-not $?) { throw 'pkg build failed' }

# Move the produced executable into the distribution folder
$exeSource = Join-Path $dist 'hana-mcp-server.exe'
$exeDest = Join-Path $outDir 'hana-mcp-server.exe'
Move-Item -Path $exeSource -Destination $exeDest -Force

# Copy runtime filesystem assets, preserving the same directory layout the
# source code expects (docs/kb, scripts/, node_modules/@sap/hana-client).
Write-Host "Copying runtime assets..."
function Copy-Relative($src, $dst) {
  $srcPath = Join-Path $root $src
  $dstPath = Join-Path $outDir $dst
  if (Test-Path $srcPath) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $dstPath) -Force | Out-Null
    Copy-Item -Path $srcPath -Destination $dstPath -Recurse -Force
  } else {
    Write-Warning "Missing $src"
  }
}

Copy-Relative 'src\licensing\public-key.pem' 'public-key.pem'
Copy-Relative 'docs\kb\bundled' 'docs\kb\bundled'
Copy-Relative 'docs\kb\index.md' 'docs\kb\index.md'
Copy-Relative 'config' 'config'
Copy-Relative 'LICENSE' 'LICENSE'
Copy-Relative '.env.example' '.env.example'
Copy-Relative 'mcp.json.example' 'mcp.json.example'
Copy-Relative 'README-CLIENTE.md' 'README-CLIENTE.md'
Copy-Relative 'docs\distribucion-repo-README.md' 'README.md'
# license-menu.js is bundled inside the executable snapshot (see package.json pkg.scripts)
# and is invoked via "hana-mcp-server.exe --license-menu", so we do not ship it as a
# separate filesystem file here. Updater scripts remain plain files because the OS
# executes them directly.
Copy-Relative 'scripts\update-client.ps1' 'scripts\update-client.ps1'

# Generate license-menu launchers next to the .exe so the client can open the
# license menu with a double click without needing Node.js installed.
$batPath = Join-Path $outDir 'license-menu.bat'
@'
@echo off
REM Lanzador del menu de licencias para el paquete ejecutable.
REM Se ubica junto a hana-mcp-server.exe.

cd /d "%~dp0"
hana-mcp-server.exe --license-menu
if errorlevel 1 pause
'@ | Set-Content -Path $batPath -Encoding ASCII -NoNewline

$ps1Path = Join-Path $outDir 'license-menu.ps1'
@'
#!/usr/bin/env pwsh
# Lanzador del menu de licencias para el paquete ejecutable.
# Se ubica junto a hana-mcp-server.exe.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $scriptDir 'hana-mcp-server.exe'

& $exePath --license-menu
'@ | Set-Content -Path $ps1Path -Encoding UTF8 -NoNewline
Copy-Relative 'scripts\update-client.sh' 'scripts\update-client.sh'
Copy-Relative 'scripts\start.bat' 'start.bat'

# pkg can package the JS but cannot load the native .node binary from its
# snapshot on all environments. Ship a real copy of @sap/hana-client next to
# the .exe so the runtime loader can dlopen it from the filesystem.
Write-Host "Copying @sap/hana-client native module..."
Copy-Relative 'node_modules\@sap\hana-client\package.json' 'node_modules\@sap\hana-client\package.json'
Copy-Relative 'node_modules\@sap\hana-client\lib' 'node_modules\@sap\hana-client\lib'
Copy-Relative 'node_modules\@sap\hana-client\prebuilt\ntamd64-msvc2022' 'node_modules\@sap\hana-client\prebuilt\ntamd64-msvc2022'
Copy-Relative 'node_modules\@sap\hana-client\node_modules\debug' 'node_modules\@sap\hana-client\node_modules\debug'
Copy-Relative 'node_modules\@sap\hana-client\node_modules\ms' 'node_modules\@sap\hana-client\node_modules\ms'

# Create a ZIP distribution
$zipPath = Join-Path $dist "hana-mcp-server-v$version-win-x64.zip"
if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }
Compress-Archive -Path $outDir -DestinationPath $zipPath -Force

Write-Host "`nBuild complete:" -ForegroundColor Green
Write-Host "  Folder: $outDir"
Write-Host "  ZIP:    $zipPath"
Write-Host "  Size:   $([math]::Round((Get-Item $exeDest).Length / 1MB, 2)) MB"
