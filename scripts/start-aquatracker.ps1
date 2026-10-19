$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
function Get-ListeningPid($port) {
  $line = netstat -ano 2>$null | Select-String ":$port " | Select-Object -First 1
  if ($line) { ($line -split '\s+')[-1] } else { $null }
}
# If old project server running on 3001, kill it (only if node.exe from this dir)
$pid3001 = Get-ListeningPid 3001
if ($pid3001) {
  $proc = Get-Process -Id $pid3001 -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') {
    Write-Host "Stopping old server (PID $pid3001)..."
    Stop-Process -Id $pid3001 -Force
    Start-Sleep -Seconds 1
  }
}
# Find free port starting at 3001
$port = 3001
while ($true) {
  $p = Get-ListeningPid $port
  if (-not $p) { break }
  $port += 1
  if ($port -gt 3003) { Write-Error "No free port between 3001-3003"; exit 1 }
}
Write-Host "Starting AquaTracker on port $port ..."
$env:PORT = $port
node .\server.js
