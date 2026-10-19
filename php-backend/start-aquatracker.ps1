<#
    AquaTracker - starts everything the app needs.

      1. MySQL Server 26.7 on port 3306  (config: mysql\my-aquatracker.ini)
      2. Apache + PHP       on port 8080  (config: C:\xampp\apache\conf\httpd.conf)

    Run start-aquatracker.bat (which calls this) or, from PowerShell:

        .\start-aquatracker.ps1

    Safe to run more than once: anything already listening is left alone.

    Neither server is registered as a Windows service on this machine, so this is
    the quickest way back up after a reboot.

    Why PowerShell and not a pure .bat: the "wait until the port answers" loop
    needs a real loop with a condition, and doing that in cmd.exe means either a
    goto inside a called subroutine nested in a parenthesised block (which cmd
    handles unpredictably) or a ping-per-iteration timer. Both are fragile.
#>

$ErrorActionPreference = 'Stop'

$here          = Split-Path -Parent $MyInvocation.MyCommand.Path
$xampp         = 'C:\xampp'
$mysqlIni      = Join-Path $here 'mysql\my-aquatracker.ini'
$mysqld        = 'C:\Program Files\MySQL\MySQL Server 26.7\bin\mysqld.exe'
$httpd         = Join-Path $xampp 'apache\bin\httpd.exe'
$httpdConf     = Join-Path $xampp 'apache\conf\httpd.conf'
$portDb        = 3306
$portWeb       = 8080
$dbErrorLog    = 'C:\xampp\mysql\data-aquatracker\error.log'
$apacheErrLog  = Join-Path $xampp 'apache\logs\error.log'

function Write-Step  ($m) { Write-Host "  $m" }
function Write-Good  ($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Write-Bad   ($m) { Write-Host "  [X]  $m" -ForegroundColor Red }

function Test-Listening ([int]$Port) {
    try {
        return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    } catch {
        return $false
    }
}

# Polls until the port answers, or the timeout expires. Returns $true/$false.
function Wait-Listening ([int]$Port, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Listening $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return (Test-Listening $Port)
}

function Show-Tail ([string]$Path, [int]$Lines = 6) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Host "          (no log at $Path)"
        return
    }
    foreach ($line in (Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction SilentlyContinue)) {
        Write-Host "          $line"
    }
}

Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Cyan
Write-Host '   AquaTracker   Apache + PHP + MySQL' -ForegroundColor Cyan
Write-Host ' ============================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- preflight --
$missing = @()
if (-not (Test-Path -LiteralPath $mysqlIni)) { $missing += "database config: $mysqlIni" }
if (-not (Test-Path -LiteralPath $mysqld))  { $missing += "mysqld.exe: $mysqld" }
if (-not (Test-Path -LiteralPath $httpdConf)) { $missing += "Apache config: $httpdConf" }
if (-not (Test-Path -LiteralPath $httpd))   { $missing += "httpd.exe: $httpd" }

if ($missing.Count -gt 0) {
    Write-Bad 'Cannot find:'
    $missing | ForEach-Object { Write-Host "          $_" }
    if ($missing -match 'httpd') {
        Write-Host "          Is XAMPP installed at $xampp ?" -ForegroundColor Yellow
    }
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
}

# ------------------------------------------------------------------ MySQL ----
if (Test-Listening $portDb) {
    Write-Step "[1/2] MySQL is already running on port $portDb."
} else {
    Write-Step "[1/2] MySQL is down. Starting it on port $portDb ..."
    Start-Process -FilePath $mysqld `
                  -ArgumentList "--defaults-file=`"$mysqlIni`"", '--standalone' `
                  -WindowStyle Hidden

    if (Wait-Listening $portDb 45) {
        Write-Good 'MySQL is up.'
    } else {
        Write-Bad 'MySQL did not start within 45 seconds.'
        Write-Host '          The last thing it said:' -ForegroundColor Yellow
        Show-Tail $dbErrorLog
        Write-Host ''
        Read-Host '  Press Enter to close'
        exit 1
    }
}

# ---------------------------------------------------------------- Apache -----
if (Test-Listening $portWeb) {
    Write-Step "[2/2] Apache is already running on port $portWeb."
} else {
    Write-Step "[2/2] Apache is down. Starting it on port $portWeb ..."
    Start-Process -FilePath $httpd -ArgumentList '-f', "`"$httpdConf`"" -WindowStyle Hidden

    if (Wait-Listening $portWeb 25) {
        Write-Good 'Apache is up.'
    } else {
        Write-Bad 'Apache did not start within 25 seconds.'
        Write-Host '          Check that conf\extra\httpd-xampp.conf still includes' -ForegroundColor Yellow
        Write-Host '          httpd-aquatracker.conf, then look at:' -ForegroundColor Yellow
        Show-Tail $apacheErrLog
        Write-Host ''
        Read-Host '  Press Enter to close'
        exit 1
    }
}

# ------------------------------------------------------------------ ready ----
Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Green
Write-Host '   Ready.' -ForegroundColor Green
Write-Host ''
Write-Host "     App         http://localhost:$portWeb/"
Write-Host "     Sign in     http://localhost:$portWeb/auth/customer/login"
Write-Host "     Staff       http://localhost:$portWeb/auth/staff/login"
Write-Host "     Owner       http://localhost:$portWeb/auth/owner/login"
Write-Host "     Installer   http://localhost:$portWeb/install"
Write-Host ''
Write-Host '     customer.demo@example.com  /  CustomerDemo123!'
Write-Host '     owner.demo@example.com     /  OwnerDemo123!'
Write-Host '     staff.demo@example.com     /  StaffDemo123!'
Write-Host ''
Write-Host '   phpMyAdmin is untouched:  http://localhost/phpmyadmin' -ForegroundColor DarkGray
Write-Host ' ============================================================' -ForegroundColor Green
Write-Host ''

Start-Process "http://localhost:$portWeb/"
exit 0