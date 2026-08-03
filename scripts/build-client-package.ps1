#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build the source update package for the HANA MCP Server.
.DESCRIPTION
    Creates a clean distribution folder under dist/hana-mcp-client/ with the
    source files required to run the MCP with Node.js. This package is intended
    for the internal auto-update mechanism (hana_apply_update / CDN) and for
    advanced users who prefer a Node.js-based deployment.

    The package delivered to end clients is the executable built by
    scripts/build-exe.ps1 (dist/hana-mcp-server-v<version>-win-x64.zip).

    Excludes vendor-only assets such as the license backend, private keys,
    tests and administrative scripts.

.PARAMETER OutputDir
    Output directory for the package.

.PARAMETER IncludeSource
    If set, includes source code (src/). This is the default and required for
    the update mechanism.
#>
param(
    [string]$OutputDir = "dist\hana-mcp-client",
    [switch]$IncludeSource = $true
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $repoRoot $OutputDir

Write-Host "Building client package to: $outPath"

# Clean and create output dir
if (Test-Path $outPath) {
    Remove-Item -Recurse -Force $outPath
}
New-Item -ItemType Directory -Path $outPath | Out-Null

# Files always included
$filesToCopy = @(
    ".env.example",
    "mcp.json.example",
    "package.json",
    "README-CLIENTE.md"
)

foreach ($file in $filesToCopy) {
    $src = Join-Path $repoRoot $file
    if (Test-Path $src) {
        Copy-Item $src $outPath
    } else {
        Write-Warning "File not found, skipping: $src"
    }
}

# Source distribution
if ($IncludeSource) {
    Copy-Item (Join-Path $repoRoot "hana-mcp-server.js") $outPath

    $srcOut = Join-Path $outPath "src"
    Copy-Item -Recurse (Join-Path $repoRoot "src") $srcOut

    $docsOut = Join-Path $outPath "docs"
    New-Item -ItemType Directory -Path $docsOut | Out-Null
    Copy-Item -Recurse (Join-Path $repoRoot "config") (Join-Path $outPath "config")
    $kbOut = Join-Path $docsOut "kb"
    New-Item -ItemType Directory -Path $kbOut | Out-Null
    # Vendor-shipped cases (overwrite on updates)
    Copy-Item -Recurse (Join-Path $repoRoot "docs\kb\bundled") (Join-Path $kbOut "bundled")
    # Index of all cases
    Copy-Item (Join-Path $repoRoot "docs\kb\index.md") (Join-Path $kbOut "index.md")
    # User-created and remote-synced cases are preserved across updates
    New-Item -ItemType Directory -Path (Join-Path $kbOut "user") | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $kbOut "remote") | Out-Null
    # Marker so the updater knows this is a split KB layout
    Set-Content -Path (Join-Path $kbOut ".split-layout") -Value "vendor=bundled user=user remote=remote" -Encoding UTF8

    # Copy updater scripts, license menu and requirement helpers
    $scriptsOut = Join-Path $outPath "scripts"
    New-Item -ItemType Directory -Path $scriptsOut | Out-Null
    Copy-Item (Join-Path $repoRoot "scripts\update-client.ps1") $scriptsOut
    Copy-Item (Join-Path $repoRoot "scripts\update-client.sh") $scriptsOut
    Copy-Item (Join-Path $repoRoot "scripts\license-menu.js") $scriptsOut
    Copy-Item (Join-Path $repoRoot "scripts\check-requirements.js") $scriptsOut
    Copy-Item (Join-Path $repoRoot "scripts\install-requirements.js") $scriptsOut

    Write-Host "Installing production dependencies..."
    Push-Location $outPath
    try {
        npm install --production --silent
    } finally {
        Pop-Location
    }

    # Remove dev-only files that npm might leave
    $cleanup = @("package-lock.json")
    foreach ($c in $cleanup) {
        $p = Join-Path $outPath $c
        if (Test-Path $p) { Remove-Item $p -Force }
    }
}

# Create launcher scripts
$startPs1 = @"
# Launch HANA MCP Server
`$env:NODE_ENV = "production"
node "`$PSScriptRoot\hana-mcp-server.js"
"@
Set-Content -Path (Join-Path $outPath "start.ps1") -Value $startPs1

$startBat = @"
@ echo off
set NODE_ENV=production
node "%~dp0\hana-mcp-server.js"
"@
Set-Content -Path (Join-Path $outPath "start.bat") -Value $startBat

# License menu launchers
$licenseMenuPs1 = @"
# Launch HANA MCP License Menu
node "`$PSScriptRoot\scripts\license-menu.js"
"@
Set-Content -Path (Join-Path $outPath "license-menu.ps1") -Value $licenseMenuPs1

$licenseMenuBat = @"
@ echo off
node "%~dp0\scripts\license-menu.js"
"@
Set-Content -Path (Join-Path $outPath "license-menu.bat") -Value $licenseMenuBat

# First-run wizard launchers
$firstRunPs1 = @"
# Launch HANA MCP first-run configuration wizard
node "`$PSScriptRoot\scripts\license-menu.js" --first-run
"@
Set-Content -Path (Join-Path $outPath "first-run.ps1") -Value $firstRunPs1

$firstRunBat = @"
@ echo off
node "%~dp0\scripts\license-menu.js" --first-run
"@
Set-Content -Path (Join-Path $outPath "first-run.bat") -Value $firstRunBat

# Sanity checks
$prohibited = @(
    "private-key.pem",
    "backend",
    "scripts\generate-license-keys.js",
    "scripts\generate-license-token.js",
    "scripts\deploy-license-server.ps1",
    "scripts\deploy-license-server.sh",
    "hana-mcp-ui"
)

foreach ($p in $prohibited) {
    $full = Join-Path $outPath $p
    if (Test-Path $full) {
        throw "Prohibited file/directory found in package: $p"
    }
}

# Create a distribution ZIP (for CDN / auto-update)
$version = (Get-Content (Join-Path $repoRoot "package.json") | ConvertFrom-Json).version
$zipName = "hana-mcp-client-$version.zip"
$zipPath = Join-Path (Split-Path -Parent $outPath) $zipName

Write-Host ""
Write-Host "Creating distribution ZIP: $zipPath"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
Compress-Archive -Path "$outPath\*" -DestinationPath $zipPath -Force

$hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash
Write-Host "SHA256: $hash"

Write-Host ""
Write-Host "Client package built successfully."
Write-Host "Next steps:"
Write-Host "  1. Review $outPath"
Write-Host "  2. Upload $zipPath to your CDN and register it in /admin/releases"
Write-Host "  3. Create .env and mcp.json on the client machine from the example files."
Write-Host "  4. Provide the JWT license token generated for the client's hardware ID."
