$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeDirectory = Join-Path $env:ProgramFiles "nodejs"
  if (Test-Path (Join-Path $nodeDirectory "node.exe")) {
    $env:PATH = "$nodeDirectory;$env:PATH"
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed. Install Node.js LTS from https://nodejs.org/ and run this launcher again."
  exit 1
}

if (-not (Test-Path ".\node_modules\express\package.json")) {
  Write-Host "Installing AquaTracker dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host "Starting AquaTracker..."
node .\server.js
