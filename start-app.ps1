$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       AquaTracker System Launcher       " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeDirectory = Join-Path $env:ProgramFiles "nodejs"
  if (Test-Path (Join-Path $nodeDirectory "node.exe")) {
    $env:PATH = "$nodeDirectory;$env:PATH"
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed. Please install Node.js LTS from https://nodejs.org/ and run this launcher again."
  exit 1
}

if (-not (Test-Path ".\node_modules\express\package.json")) {
  Write-Host "Installing AquaTracker dependencies..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies."
    exit $LASTEXITCODE
  }
}

Write-Host "Starting AquaTracker Server at http://localhost:3001..." -ForegroundColor Green
node .\server.js
