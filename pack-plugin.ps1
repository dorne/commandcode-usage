$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$packageName = "commandcode-usage"
$archiveName = "commandcode-usage.zip"
$archivePath = Join-Path $PSScriptRoot $archiveName

$requiredFiles = @(
  "package.json",
  "LICENSE",
  "icon.svg",
  "panel\index.html",
  "panel\styles.css",
  "panel\main.js",
  "service\main.js"
)
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("$packageName-" + [guid]::NewGuid().ToString("N"))

foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
    throw "Required package file is missing: $file. Run 'bun run build' first."
  }
}

$manifest = Get-Content -LiteralPath ".\package.json" -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($manifest.version) -or $manifest.version -notmatch '^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$') {
  throw "package.json must contain a valid SemVer version, for example 1.0.0."
}

try {
  foreach ($file in $requiredFiles) {
    $source = Join-Path $PSScriptRoot $file
    $destination = Join-Path $staging $file
    $directory = Split-Path -Parent $destination
    if ($directory) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }

  Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $archivePath -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("/", "\") })
    foreach ($file in $requiredFiles) {
      if ($entries -notcontains $file) {
        throw "The ZIP is missing required file: $file"
      }
    }
    if ($entries | Where-Object { $_ -match '\.ts$|(^|\\)node_modules\\' }) {
      throw "The ZIP must not contain TypeScript sources or node_modules."
    }
  } finally {
    $archive.Dispose()
  }

  Write-Host "OpenChamber plugin ZIP created and verified: $archivePath" -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
  }
}
