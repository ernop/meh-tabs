# Firefox Extension Build & Sign Script
# ======================================
# SETUP:
# 1. npm install -g web-ext
# 2. Create amo-credentials.local with AMO_JWT_ISSUER and AMO_JWT_SECRET
# 3. Copy dist/policies.json to: C:\Program Files\Mozilla Firefox\distribution\
#
# USAGE:
#   .\build-and-sign.ps1           # Build, sign, and serve
#   .\build-and-sign.ps1 -BumpVersion patch  # Bump patch version (1.0.0 -> 1.0.1)
#   .\build-and-sign.ps1 -BumpVersion minor  # Bump minor version (1.0.0 -> 1.1.0)
#   .\build-and-sign.ps1 -ServerOnly         # Just start the update server

param(
    [ValidateSet("patch", "minor", "major", "")]
    [string]$BumpVersion = "",
    [switch]$ServerOnly,
    [switch]$StartServer,
    [int]$Port = 8730
)

$ErrorActionPreference = "Stop"
$ExtensionDir = $PSScriptRoot
$DistDir = Join-Path $ExtensionDir "dist"
$ManifestPath = Join-Path $ExtensionDir "manifest.json"

# Ensure dist directory exists
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

function Get-ManifestVersion {
    $manifest = Get-Content $ManifestPath | ConvertFrom-Json
    return $manifest.version
}

function Set-ManifestVersion {
    param([string]$NewVersion)
    $content = Get-Content $ManifestPath -Raw
    $content = $content -replace '"version":\s*"[^"]+"', "`"version`": `"$NewVersion`""
    Set-Content -Path $ManifestPath -Value $content -NoNewline
}

function Bump-Version {
    param([string]$Type)
    $current = Get-ManifestVersion
    $parts = $current.Split(".")
    
    # Ensure we have 3 parts
    while ($parts.Count -lt 3) { $parts += "0" }
    
    switch ($Type) {
        "major" { $parts[0] = [int]$parts[0] + 1; $parts[1] = "0"; $parts[2] = "0" }
        "minor" { $parts[1] = [int]$parts[1] + 1; $parts[2] = "0" }
        "patch" { $parts[2] = [int]$parts[2] + 1 }
    }
    
    $newVersion = $parts -join "."
    Set-ManifestVersion $newVersion
    Write-Host "Version bumped: $current -> $newVersion" -ForegroundColor Green
    return $newVersion
}

function Write-UpdatesJson {
    param([string]$Version, [string]$XpiFileName)
    
    $manifest = Get-Content $ManifestPath | ConvertFrom-Json
    $extensionId = $manifest.browser_specific_settings.gecko.id
    
    $updates = @{
        addons = @{
            $extensionId = @{
                updates = @(
                    @{
                        version = $Version
                        update_link = "http://localhost:$Port/$XpiFileName"
                    }
                )
            }
        }
    }
    
    $updatesPath = Join-Path $DistDir "updates.json"
    $updates | ConvertTo-Json -Depth 10 | Set-Content $updatesPath
    Write-Host "Created updates.json for version $Version" -ForegroundColor Cyan
}

function Write-PoliciesJson {
    $manifest = Get-Content $ManifestPath | ConvertFrom-Json
    $extensionId = $manifest.browser_specific_settings.gecko.id
    
    # Find the latest XPI in dist
    $latestXpi = Get-ChildItem -Path $DistDir -Filter "*.xpi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if ($latestXpi) {
        $xpiUrl = "http://localhost:$Port/$($latestXpi.Name)"
    } else {
        $xpiUrl = "http://localhost:$Port/custom-new-tab-latest.xpi"
    }
    
    $policies = @{
        policies = @{
            Extensions = @{
                Install = @($xpiUrl)
            }
        }
    }
    
    $policiesPath = Join-Path $DistDir "policies.json"
    $policies | ConvertTo-Json -Depth 10 | Set-Content $policiesPath
    Write-Host "`nCreated policies.json" -ForegroundColor Cyan
    Write-Host "Copy this file to: C:\Program Files\Mozilla Firefox\distribution\" -ForegroundColor Yellow
    Write-Host "  (Create the 'distribution' folder if it doesn't exist)" -ForegroundColor Yellow
}

function Start-UpdateServer {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "Starting update server on port $Port" -ForegroundColor Cyan
    Write-Host "Updates URL: http://localhost:$Port/updates.json" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    Push-Location $DistDir
    try {
        python -m http.server $Port
    } finally {
        Pop-Location
    }
}

function Get-XpiEmbeddedManifest {
    param([string]$XpiPath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $zip = [System.IO.Compression.ZipFile]::OpenRead($XpiPath)
    try {
        $entry = $zip.Entries | Where-Object { $_.FullName -eq "manifest.json" } | Select-Object -First 1
        if (-not $entry) { return $null }
        $stream = $entry.Open()
        try {
            $reader = New-Object System.IO.StreamReader($stream)
            $json = $reader.ReadToEnd()
            return $json | ConvertFrom-Json
        } finally {
            $stream.Dispose()
        }
    } finally {
        $zip.Dispose()
    }
}

# Main execution
if ($ServerOnly) {
    Start-UpdateServer
    exit
}

# Bump version if requested
if ($BumpVersion) {
    $version = Bump-Version -Type $BumpVersion
} else {
    $version = Get-ManifestVersion
}

Write-Host "`nBuilding and signing extension v$version..." -ForegroundColor Cyan

# Load API credentials from file (required)
$credentialsFile = Join-Path $ExtensionDir "amo-credentials.local"

if (-not (Test-Path $credentialsFile)) {
    Write-Host "`nERROR: amo-credentials.local not found!" -ForegroundColor Red
    Write-Host "Create this file with your AMO credentials." -ForegroundColor Yellow
    exit 1
}

$apiKey = $null
$apiSecret = $null
Get-Content $credentialsFile | ForEach-Object {
    if ($_ -match "^AMO_JWT_ISSUER=(.+)$") { $apiKey = $matches[1] }
    if ($_ -match "^AMO_JWT_SECRET=(.+)$") { $apiSecret = $matches[1] }
}

if (-not $apiKey -or -not $apiSecret) {
    Write-Host "`nERROR: amo-credentials.local is missing AMO_JWT_ISSUER or AMO_JWT_SECRET" -ForegroundColor Red
    exit 1
}

# Check for web-ext
if (-not (Get-Command "web-ext" -ErrorAction SilentlyContinue)) {
    Write-Host "`nERROR: web-ext not found!" -ForegroundColor Red
    Write-Host "Install it with: npm install -g web-ext" -ForegroundColor Yellow
    exit 1
}

# Sign the extension (unlisted)
Write-Host "`nSigning extension (unlisted)..." -ForegroundColor Cyan
Push-Location $ExtensionDir
try {
    web-ext sign --channel=unlisted --artifacts-dir="$DistDir" --api-key="$apiKey" --api-secret="$apiSecret" --ignore-files="amo-credentials.local" --ignore-files="dist" --ignore-files="*.md" --ignore-files="*.ps1"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Signing failed!" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# Find the newly created XPI
$xpiFile = Get-ChildItem -Path $DistDir -Filter "*.xpi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $xpiFile) {
    Write-Host "ERROR: No XPI file found after signing!" -ForegroundColor Red
    exit 1
}

Write-Host "Signed XPI: $($xpiFile.Name)" -ForegroundColor Green

# Safety check: ensure the XPI embedded manifest version matches manifest.json
$embeddedManifest = Get-XpiEmbeddedManifest -XpiPath $xpiFile.FullName
if (-not $embeddedManifest) {
    Write-Host "WARNING: Could not read embedded manifest.json from XPI; refusing to generate update metadata." -ForegroundColor Yellow
    exit 1
}

if ($embeddedManifest.version -ne $version) {
    Write-Host "ERROR: Version mismatch!" -ForegroundColor Red
    Write-Host "  manifest.json version: $version" -ForegroundColor Red
    Write-Host "  signed XPI version:    $($embeddedManifest.version)" -ForegroundColor Red
    Write-Host "Fix: ensure web-ext signed the current code/version, then re-run." -ForegroundColor Yellow
    exit 1
}

# Generate updates.json
Write-UpdatesJson -Version $version -XpiFileName $xpiFile.Name

# Generate policies.json (for reference)
Write-PoliciesJson

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "XPI: $($xpiFile.FullName)" -ForegroundColor White
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Start the server: .\build-and-sign.ps1 -ServerOnly" -ForegroundColor White
Write-Host "2. In Firefox: about:addons -> Gear icon -> Check for Updates" -ForegroundColor White
Write-Host "   OR restart Firefox if using policies.json" -ForegroundColor White

if ($StartServer) {
    Start-UpdateServer
}

