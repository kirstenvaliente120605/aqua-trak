$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$php = 'C:\xampp\php\php.exe'
if (-not (Test-Path -LiteralPath $php)) { throw "XAMPP PHP was not found at $php" }
$port = 8080
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($listener) { throw "Port $port is already in use. Stop the existing listener before starting AquaTracker." }
Write-Host "Starting AquaTracker PHP API at http://localhost:$port ..."
& $php -S "localhost:$port" -t . router.php
