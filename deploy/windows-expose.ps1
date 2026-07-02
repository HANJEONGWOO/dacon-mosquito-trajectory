param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$listenPort = 4173
$ruleName = "Mosquito Trajectory Visualization"
$taskName = "Mosquito Trajectory WSL Port Forward"

$wslAddresses = (& wsl.exe -d Ubuntu -e hostname -I).Trim() -split "\s+"
$wslAddress = $wslAddresses |
    Where-Object { $_ -match "^172\." } |
    Select-Object -First 1

if (-not $wslAddress) {
    throw "Could not determine the Ubuntu WSL IPv4 address."
}

& netsh.exe interface portproxy delete v4tov4 `
    listenaddress=0.0.0.0 listenport=$listenPort | Out-Null
& netsh.exe interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 listenport=$listenPort `
    connectaddress=$wslAddress connectport=$listenPort

Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $listenPort `
    -Profile Any | Out-Null

if ($Install) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Highest

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Description "Refresh the Windows-to-WSL port forward for the mosquito trajectory visualization." `
        -Force | Out-Null
}

Write-Host "Forwarding 0.0.0.0:$listenPort to ${wslAddress}:$listenPort"
