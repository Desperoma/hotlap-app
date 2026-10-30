# Choisit un Node compatible avec Expo SDK 58 (22.13+, 24.3+ ou 26+, versions paires) parmi tous
# ceux installés sur la machine, et le met en tête du PATH de ce process : node, npm et npx
# utilisent alors tous la même version, même si une ancienne installation (Node 20, nvm…)
# passe avant dans le PATH du système ou de la tâche planifiée.
#
#   . (Join-Path $PSScriptRoot 'node.ps1'); $node = Use-SupportedNode

function Test-SupportedNode([version]$v) {
  switch ($v.Major) {
    22 { return $v.Minor -ge 13 }
    24 { return $v.Minor -ge 3 }
    default { return $v.Major -ge 26 -and $v.Major % 2 -eq 0 }
  }
}

function Find-NodeCandidates {
  $paths = @()
  $paths += Get-Command node -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }
  $paths += "$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
  # nvm-windows (NVM_HOME ou emplacements par défaut), fnm, volta
  foreach ($root in @($env:NVM_HOME, "$env:APPDATA\nvm", 'C:\nvm4w', "$env:LOCALAPPDATA\fnm\node-versions", "$env:LOCALAPPDATA\Volta\tools\image\node")) {
    if ($root -and (Test-Path $root)) {
      $paths += Get-ChildItem $root -Recurse -Depth 3 -Filter node.exe -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    }
  }
  $paths | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { (Resolve-Path $_).Path } | Select-Object -Unique
}

function Use-SupportedNode {
  $found = foreach ($p in Find-NodeCandidates) {
    $raw = (& $p -v 2>$null)
    if ($raw -match '^v(\d+\.\d+\.\d+)') { [pscustomobject]@{ Path = $p; Version = [version]$Matches[1] } }
  }
  $best = $found | Where-Object { Test-SupportedNode $_.Version } | Sort-Object Version -Descending | Select-Object -First 1
  if (-not $best) {
    $seen = ($found | ForEach-Object { "$($_.Version) ($($_.Path))" }) -join ', '
    Write-Host "Aucun Node compatible (22.13+, 24.3+ ou 26+). Trouvés : $(if ($seen) { $seen } else { 'aucun' }). Installe-le : winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
    return $null
  }
  $dir = Split-Path $best.Path
  $env:Path = "$dir;" + (($env:Path -split ';' | Where-Object { $_ -and ($_.TrimEnd('\') -ne $dir.TrimEnd('\')) }) -join ';')
  return $best.Path
}
