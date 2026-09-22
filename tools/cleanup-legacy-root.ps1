$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Write-Host "Cleaning legacy root files in $root" -ForegroundColor Cyan

$legacyFiles = @(
  'CladdingForm.tsx',
  'FixoutForm.tsx',
  'FowPlumbingForm.tsx',
  'FrameHardwareForm.tsx',
  'LockupForm.tsx',
  'PowerTrussBracesForm.tsx',
  'ShelvingForm.tsx',
  'framework_routes 3.py',
  'execute_ai 1.html',
  'ezefloor_backend.log',
  'New Document.pdf'
)

$legacyDirs = @(
  'handoff-ref',
  'ezefloor-db-catalog-aligned-package'
)

foreach ($name in $legacyFiles) {
  $path = Join-Path $root $name
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "Removed file: $name"
  }
}

# Remove the old Excel reference by prefix because Windows/ZIP may preserve a slightly different Unicode filename.
Get-ChildItem -LiteralPath $root -File -Filter 'Combined Home Door Fineline Book*' -ErrorAction SilentlyContinue |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "Removed file: $($_.Name)"
  }

foreach ($name in $legacyDirs) {
  $path = Join-Path $root $name
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Host "Removed directory: $name"
  }
}

# Common generated junk only; source/data folders are intentionally untouched.
$generatedDirs = @('.next', 'dist', 'build', '.pytest_cache', '.mypy_cache')
foreach ($name in $generatedDirs) {
  Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq $name } |
    Sort-Object FullName -Descending |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "Removed generated directory: $($_.FullName)"
    }
}

Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq '__pycache__' } |
  Sort-Object FullName -Descending |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

Get-ChildItem -LiteralPath $root -File -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in @('.pyc', '.pyo') -or $_.Name -match '\.log$' } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }

Write-Host "Legacy cleanup complete." -ForegroundColor Green
