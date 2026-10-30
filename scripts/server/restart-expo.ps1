# Redémarre le serveur Expo Go (tâche planifiée « HotLap Expo Go ») avec les caches de Metro vidés.
# À lancer après un pull qui ajoute des fichiers (images, écrans…) ou quand Metro affiche
# « Unable to resolve module » pour un fichier qui existe bien.
#
#   powershell -ExecutionPolicy Bypass -File scripts\server\restart-expo.ps1          # redémarrage + caches vidés
#   powershell -ExecutionPolicy Bypass -File scripts\server\restart-expo.ps1 -Pull    # récupère main d'abord (npm ci si besoin)
#   npm run server:restart                                                             # raccourci du premier
#
# Sans droits administrateur : la tâche appartient à ton compte.

param(
  [switch]$Pull,
  [string]$TaskName = 'HotLap Expo Go',
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Continue'
Set-Location $Repo

function Step([string]$msg) { Write-Host "-> $msg" -ForegroundColor Cyan }

# npm ci doit tourner avec le même Node que Metro (voir node.ps1).
. (Join-Path $PSScriptRoot 'node.ps1')
$nodeExe = Use-SupportedNode
if (-not $nodeExe) { exit 1 }
Step "Node : $nodeExe ($(& $nodeExe -v))"

if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  Write-Host "Tâche « $TaskName » introuvable. Installe-la avec scripts\server\install-autostart.ps1." -ForegroundColor Red
  exit 1
}

if ($Pull) {
  Step 'Récupération de main'
  $before = (git rev-parse HEAD).Trim()
  git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { Write-Host 'git pull impossible (modifications locales ?) : arrêt.' -ForegroundColor Red; exit 1 }
  $after = (git rev-parse HEAD).Trim()
  if ($before -ne $after -and ((git diff --name-only $before $after) -contains 'package-lock.json')) {
    Step 'Dépendances modifiées : npm ci (arrêt de la tâche avant, node_modules est en cours d''utilisation)'
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    npm ci --no-audit --no-fund
  }
}

Step "Arrêt de la tâche « $TaskName »"
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

# Arrêter la tâche ne tue pas toujours Node/Metro lancé par elle : on libère le port 8081.
for ($i = 0; $i -lt 10; $i++) {
  $owners = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  if (-not $owners) { break }
  foreach ($procId in $owners) { & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null }
  Start-Sleep -Milliseconds 500
}

Step 'Caches de Metro et d''Expo vidés'
Remove-Item -Recurse -Force "$env:TEMP\metro-*", "$env:TEMP\haste-map-*",
  (Join-Path $Repo 'node_modules\.cache'), (Join-Path $Repo '.expo') -ErrorAction SilentlyContinue

Step "Démarrage de la tâche « $TaskName »"
Start-ScheduledTask -TaskName $TaskName

# Metro met quelques dizaines de secondes à écouter (Tailscale, premier bundle).
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep -Seconds 2
  $ok = [bool](Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
}
$state = (Get-ScheduledTask -TaskName $TaskName).State
if ($ok) {
  Write-Host "OK : tâche $state, Metro écoute sur 8081. Recharge l'app dans Expo Go." -ForegroundColor Green
} else {
  Write-Host "Metro n'écoute pas encore sur 8081 (tâche $state). Dernières lignes du journal :" -ForegroundColor Yellow
  Get-Content (Join-Path $Repo 'logs\serve-go.log') -Tail 10 -ErrorAction SilentlyContinue
  $err = Get-ChildItem (Join-Path $Repo 'logs') -Filter 'metro-*.err.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($err) { Get-Content $err.FullName -Tail 10 }
}
