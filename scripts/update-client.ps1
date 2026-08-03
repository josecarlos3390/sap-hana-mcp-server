#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Apply a downloaded MCP client update while preserving local KB and config.
.DESCRIPTION
    This script is launched by the MCP after downloading a new release ZIP.
    It waits for the parent process to exit, extracts the ZIP, copies the new
    files over the installation directory, and preserves:
      - docs/kb/cases/   (local knowledge base)
      - .env
      - mcp.json
      - .hana-license
      - .hana-license-cache.json

.PARAMETER PackagePath
    Path to the downloaded update ZIP file.

.PARAMETER InstallDir
    Directory where the MCP client is installed. Defaults to the parent of this script.

.PARAMETER NoRestart
    If set, the script does not restart the MCP after updating.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PackagePath,

    [string]$InstallDir = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),

    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

function Write-Log($msg) {
    Write-Host "[Updater] $msg"
}

if (-not (Test-Path $PackagePath)) {
    throw "Update package not found: $PackagePath"
}

# Wait a moment for the parent process to release locks
Write-Log "Waiting for parent process to release files..."
Start-Sleep -Seconds 3

$tempDir = Join-Path $env:TEMP "hana-mcp-update-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
    Write-Log "Extracting update package to $tempDir..."
    Expand-Archive -Path $PackagePath -DestinationPath $tempDir -Force

    $sourceDir = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1
    if (-not $sourceDir) {
        $sourceDir = $tempDir
    } else {
        $sourceDir = $sourceDir.FullName
    }

    Write-Log "Source directory: $sourceDir"
    Write-Log "Install directory: $InstallDir"

    # Files and directories to preserve (do not overwrite)
    $preserve = @(
        "docs\kb\cases",
        ".env",
        "mcp.json",
        ".hana-license",
        ".hana-license-cache.json"
    )

    # Copy new files, skipping preserved paths
    $items = Get-ChildItem -Path $sourceDir -Recurse -File
    foreach ($item in $items) {
        $relative = $item.FullName.Substring($sourceDir.Length + 1)
        $shouldPreserve = $false
        foreach ($p in $preserve) {
            if ($relative -like "$p*") {
                $shouldPreserve = $true
                break
            }
        }
        if ($shouldPreserve) {
            Write-Log "Preserving local file: $relative"
            continue
        }

        $dest = Join-Path $InstallDir $relative
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item $item.FullName $dest -Force
    }

    # Clean up update cache and pending flag
    $cacheDir = Join-Path $InstallDir ".update-cache"
    if (Test-Path $cacheDir) {
        Remove-Item -Recurse -Force $cacheDir
    }
    $pendingFile = Join-Path $InstallDir ".pending-update.json"
    if (Test-Path $pendingFile) {
        Remove-Item $pendingFile -Force
    }

    Write-Log "Update applied successfully."

    if (-not $NoRestart) {
        $startScript = Join-Path $InstallDir "start.ps1"
        if (Test-Path $startScript) {
            Write-Log "Restarting MCP..."
            Start-Process powershell -ArgumentList "-File", "`"$startScript`"" -WorkingDirectory $InstallDir
        } else {
            Write-Warning "start.ps1 not found; please restart the MCP manually."
        }
    }
} finally {
    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }
}
