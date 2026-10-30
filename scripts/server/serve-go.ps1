# Serveur Expo Go permanent pour les testeurs iPhone (via Tailscale).
#
# - attend que Tailscale ait une IP, puis la donne à Expo (REACT_NATIVE_PACKAGER_HOSTNAME) ;
# - lance `npm run start:go` et le relance s'il s'arrête ;
# - toutes les $PullMinutes minutes, récupère main : Metro recharge seul les fichiers modifiés,
#   et le serveur redémarre seulement si les dépendances (package-lock.json) ont changé.
#
# Lancé au démarrage de Windows par la tâche planifiée « HotLap Expo Go »
# (voir install-autostart.ps1). Journaux dans logs\ à la racine du dépôt : serve-go.log (cette boucle)
# et metro-<date>.log / .err.log (un par lancement de Metro, les 10 derniers sont gardés).
# Prérequis, une seule fois : .env.local rempli, `npx expo login` avec le compte des testeurs.

param(
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [int]$PullMinutes = 10,
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Continue'
Set-Location $Repo
$logDir = Join-Path $Repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'serve-go.log'

function Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line  # pas Write-Output : ne doit pas polluer la valeur de retour des fonctions
}

function Get-TailscaleIp {
  $exe = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
  if (-not $exe) { $exe = 'C:\Program Files\Tailscale\tailscale.exe' }
  if (-not (Test-Path $exe)) { return $null }
  $ip = & $exe ip -4 2>$null | Select-Object -First 1
  if ($ip) { return $ip.Trim() }
  return $null
}

function Start-Metro {
  # Un ancien Metro (lancé à la main, ou resté d'un lancement précédent) garderait le port :
  # Expo, sans terminal pour demander « utiliser 8082 ? », s'arrêterait aussitôt.
  Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Log "Port 8081 occupé (PID $($_.OwningProcess)) : arrêt"; & taskkill.exe /PID $_.OwningProcess /T /F | Out-Null }

  # Un journal par lancement : un fichier encore ouvert par un ancien process ne bloque plus rien.
  Get-ChildItem $logDir -Filter 'metro-*.log' | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 20 | Remove-Item -ErrorAction SilentlyContinue
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $out = Join-Path $logDir "metro-$stamp.log"
  $err = Join-Path $logDir "metro-$stamp.err.log"

  $node = $script:NodeExe
  Log "Démarrage de Metro (Expo Go) sur $($env:REACT_NATIVE_PACKAGER_HOSTNAME):8081 avec Node $(& $node -v) ; journal $([IO.Path]::GetFileName($out))"
  # Node directement (pas cmd /c) : pas de question « Terminer le programme de commandes (O/N) ? »
  # qui bloque le process et son journal.
  return Start-Process -FilePath $node -ArgumentList 'scripts\start-go.mjs' `
    -WorkingDirectory $Repo -NoNewWindow -PassThru `
    -RedirectStandardOutput $out -RedirectStandardError $err
}

function Stop-Metro($proc) {
  if ($proc -and -not $proc.HasExited) {
    # /T : arrête aussi node et Metro, lancés par npm.
    & taskkill.exe /PID $proc.Id /T /F | Out-Null
  }
}

function Update-Repo {
  # Renvoie $true si les dépendances ont changé (redémarrage nécessaire).
  git fetch --quiet origin $Branch 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { return $false }  # pas de réseau : on réessaiera
  $local = (git rev-parse HEAD).Trim()
  $remote = (git rev-parse "origin/$Branch").Trim()
  if ($local -eq $remote) { return $false }
  $changed = git diff --name-only $local $remote
  $pull = git pull --ff-only --quiet origin $Branch 2>&1
  if ($LASTEXITCODE -ne 0) {
    Log "git pull impossible (modifications locales ?) : $pull"
    return $false
  }
  Log "Mis à jour : $($local.Substring(0,7)) -> $($remote.Substring(0,7))"
  if ($changed -contains 'package-lock.json') {
    Log 'Dépendances modifiées : npm ci'
    npm ci --no-audit --no-fund 2>&1 | Out-Null
    return $true
  }
  # Fichiers ajoutés, supprimés ou renommés : Metro garde l'ancienne liste en cache
  # (« Unable to resolve module ») : redémarrage avec caches vidés.
  $moved = git diff --name-status --diff-filter=ADR $local $remote
  if ($moved) {
    Log 'Fichiers ajoutés ou supprimés : redémarrage de Metro avec caches vidés'
    Remove-Item -Recurse -Force "$env:TEMP\metro-*", "$env:TEMP\haste-map-*", (Join-Path $Repo 'node_modules\.cache'), (Join-Path $Repo '.expo') -ErrorAction SilentlyContinue
    return $true
  }
  return $false
}

Log "=== Démarrage (dépôt $Repo, branche $Branch) ==="

# 0. Node compatible avec Expo, en tête du PATH (npm ci et Metro utilisent alors le même).
. (Join-Path $PSScriptRoot 'node.ps1')
$script:NodeExe = Use-SupportedNode
if (-not $script:NodeExe) { Log 'Aucun Node 22.13+ / 24.3+ installé : arrêt (winget install OpenJS.NodeJS.LTS).'; exit 1 }
Log "Node choisi : $script:NodeExe ($(& $script:NodeExe -v))"

# 1. Tailscale : au démarrage de Windows, l'IP peut mettre un moment à arriver.
$ip = $null
for ($i = 0; $i -lt 60 -and -not $ip; $i++) {
  $ip = Get-TailscaleIp
  if (-not $ip) { Start-Sleep -Seconds 5 }
}
if (-not $ip) { Log 'Pas d''IP Tailscale après 5 minutes : arrêt (la tâche réessaiera).'; exit 1 }
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip

if (-not (Test-Path (Join-Path $Repo '.env.local')) -and -not (Test-Path (Join-Path $Repo '.env'))) {
  Log 'Attention : ni .env.local ni .env : l''app démarrera en mode démo.'
}

# 2. Code à jour avant le premier démarrage.
$null = Update-Repo
if (-not (Test-Path (Join-Path $Repo 'node_modules'))) { npm ci --no-audit --no-fund 2>&1 | Out-Null }

# 3. Boucle : Metro relancé s'il s'arrête, code récupéré régulièrement.
$metro = Start-Metro
$nextPull = (Get-Date).AddMinutes($PullMinutes)
while ($true) {
  Start-Sleep -Seconds 15

  # L'IP Tailscale peut changer (rare) : il faut alors redémarrer Metro.
  $current = Get-TailscaleIp
  if ($current -and $current -ne $env:REACT_NATIVE_PACKAGER_HOSTNAME) {
    Log "Nouvelle IP Tailscale : $current"
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $current
    Stop-Metro $metro
    $metro = Start-Metro
  }

  if ($metro.HasExited) {
    Log "Metro s'est arrêté (code $($metro.ExitCode)), relance dans 10 s"
    Start-Sleep -Seconds 10
    $metro = Start-Metro
  }

  if ((Get-Date) -ge $nextPull) {
    $nextPull = (Get-Date).AddMinutes($PullMinutes)
    if (Update-Repo) {
      Stop-Metro $metro
      $metro = Start-Metro
    }
  }
}
