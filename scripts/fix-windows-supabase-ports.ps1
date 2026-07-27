<#
.SYNOPSIS
    Permanently reserves the local Supabase ports (54320-54340) for this machine.

.DESCRIPTION
    Windows hands ports 49152-65535 to the ephemeral pool and WinNAT/Hyper-V
    reserves random 100-port blocks out of it on every boot. When such a block
    covers 54321-54324, Docker cannot publish the Supabase ports and every
    container of the local stack dies with:

        bind: An attempt was made to access a socket in a way forbidden by its
        access permissions

    Adding an *administered* exclusion with store=persistent keeps WinNAT away
    from those ports across reboots while still allowing Docker to bind them
    explicitly. Run this once, elevated.

.NOTES
    Restarting WinNAT briefly drops Docker/WSL NAT networking. Close nothing
    else; running containers reconnect on their own.
#>

$ErrorActionPreference = 'Stop'

$startPort = 54320
$numberOfPorts = 21
$endPort = $startPort + $numberOfPorts - 1

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must run elevated. Right-click PowerShell > 'Run as administrator', then run it again."
}

Write-Host "Current TCP port exclusions overlapping $startPort-$endPort" -ForegroundColor Cyan
netsh int ipv4 show excludedportrange protocol=tcp

Write-Host "`nStopping WinNAT to release the auto-reserved ranges..." -ForegroundColor Cyan
$winnat = Get-Service -Name winnat -ErrorAction SilentlyContinue
if ($winnat -and $winnat.Status -eq 'Running') {
    Stop-Service -Name winnat -Force
}

try {
    Write-Host "Reserving $startPort-$endPort persistently..." -ForegroundColor Cyan
    netsh int ipv4 add excludedportrange protocol=tcp startport=$startPort numberofports=$numberOfPorts store=persistent
}
finally {
    Write-Host "Starting WinNAT..." -ForegroundColor Cyan
    if ($winnat) {
        Start-Service -Name winnat
    }
}

Write-Host "`nVerifying the ports can be bound..." -ForegroundColor Cyan
$failed = @()
foreach ($port in 54321, 54322, 54323, 54324) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
        $listener.Start()
        $listener.Stop()
        Write-Host "  ${port}: OK" -ForegroundColor Green
    }
    catch [System.Net.Sockets.SocketException] {
        if ($_.Exception.SocketErrorCode -eq 'AddressAlreadyInUse') {
            Write-Host "  ${port}: already in use (a container is listening) - fine" -ForegroundColor Green
        }
        else {
            Write-Host "  ${port}: BLOCKED ($($_.Exception.SocketErrorCode))" -ForegroundColor Red
            $failed += $port
        }
    }
}

if ($failed.Count -gt 0) {
    Write-Error "Ports still blocked: $($failed -join ', '). Reboot and run this script again before Docker Desktop starts."
}

Write-Host "`nDone. Start the stack with: pnpm supabase:start" -ForegroundColor Green
