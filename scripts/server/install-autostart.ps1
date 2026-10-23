#Requires -RunAsAdministrator
# Installe la tâche planifiée « HotLap Expo Go » : lance serve-go.ps1 au démarrage de Windows,
# même sans session ouverte, et la relance si elle s'arrête.
#
#   powershell -ExecutionPolicy Bypass -File scripts\server\install-autostart.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\server\install-autostart.ps1 -AtLogon   # à l'ouverture de session, sans mot de passe
#   powershell -ExecutionPolicy Bypass -File scripts\server\install-autostart.ps1 -Uninstall
#
# La tâche tourne sous TON compte Windows : elle utilise ta session `npx expo login`,
# ton Node.js et tes accès Git. Le mot de passe demandé est celui du compte Windows
# (pour un compte Microsoft : le mot de passe Microsoft, pas le code PIN). Il est confié
# au Planificateur de tâches, jamais écrit dans un fichier.

param(
  [switch]$AtLogon,
  [switch]$Uninstall,
  [int]$PullMinutes = 10
)

$TaskName = 'HotLap Expo Go'
$RuleName = 'HotLap Metro 8081 (Tailscale)'

if ($Uninstall) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
  Write-Output "Tâche « $TaskName » et règle de pare-feu supprimées."
  return
}

$script = Join-Path $PSScriptRoot 'serve-go.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -PullMinutes $PullMinutes"

$trigger = if ($AtLogon) {
  New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
} else {
  New-ScheduledTaskTrigger -AtStartup
}
$trigger.Delay = 'PT1M'  # laisse le réseau et Tailscale démarrer

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew

if ($AtLogon) {
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
} else {
  $cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message 'Mot de passe Windows : la tâche démarre avant toute ouverture de session'
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null
}

# Metro écoute sur 8081 : ouvert uniquement aux adresses Tailscale (100.64.0.0/10).
if (-not (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP -LocalPort 8081 `
    -RemoteAddress 100.64.0.0/10 -Action Allow -Profile Any | Out-Null
}

Write-Output "Tâche « $TaskName » installée ($(if ($AtLogon) { 'à l''ouverture de session' } else { 'au démarrage de Windows' }))."
Write-Output 'Démarrer maintenant : Start-ScheduledTask -TaskName ''HotLap Expo Go'''
Write-Output 'Journaux : logs\serve-go.log, et logs\metro-<date>.log pour chaque lancement de Metro'
