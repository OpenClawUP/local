$ErrorActionPreference = "Stop"

$OpenClawDir = Join-Path $HOME ".openclaw"
$ManagerDir = Join-Path $env:LOCALAPPDATA "OpenClawUP Local"
$TaskOpenClawName = "OpenClawUP-OpenClaw"
$TaskManagerName = "OpenClawUP-Manager"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\OpenClawUP Local"

function Get-CommandPath([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command) {
    return $null
  }
  return $command.Source
}

function Get-NpmCommandPath {
  $npmPath = Get-CommandPath "npm.cmd"
  if (-not $npmPath) {
    $npmPath = Get-CommandPath "npm"
  }
  return $npmPath
}

function Get-NpmGlobalPrefix {
  $npmPath = Get-NpmCommandPath
  if (-not $npmPath) {
    return $null
  }

  $prefix = & $npmPath prefix -g 2>$null
  if (-not [string]::IsNullOrWhiteSpace($prefix)) {
    return $prefix.Trim()
  }

  $prefix = & $npmPath config get prefix 2>$null
  if ([string]::IsNullOrWhiteSpace($prefix)) {
    return $null
  }

  $prefix = $prefix.Trim()
  if ($prefix -in @("undefined", "null")) {
    return $null
  }

  return $prefix
}

function Add-CandidatePrefix([System.Collections.Generic.List[string]]$Prefixes, [string]$Prefix) {
  if ([string]::IsNullOrWhiteSpace($Prefix) -or $Prefixes.Contains($Prefix)) {
    return
  }

  $Prefixes.Add($Prefix) | Out-Null
}

function Get-OpenClawInstallPrefix {
  $openClawPath = Get-CommandPath "openclaw.cmd"
  if (-not $openClawPath) {
    $openClawPath = Get-CommandPath "openclaw"
  }

  if (-not $openClawPath) {
    return $null
  }

  return Split-Path -Parent (Split-Path -Parent $openClawPath)
}

function Uninstall-OpenClawFromPrefix([string]$Prefix) {
  if ([string]::IsNullOrWhiteSpace($Prefix)) {
    return $false
  }

  $binCandidates = @(
    Join-Path $Prefix "bin\openclaw.cmd",
    Join-Path $Prefix "bin\openclaw"
  )
  $packagePath = Join-Path $Prefix "lib\node_modules\openclaw"
  $hasInstall = $binCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $hasInstall -and -not (Test-Path $packagePath)) {
    return $false
  }

  $npmPath = Get-NpmCommandPath
  if (-not $npmPath) {
    Write-Host "  WARN npm not found; skipped OpenClaw uninstall for $Prefix" -ForegroundColor Yellow
    return $false
  }

  Write-Host "  Removing OpenClaw from $Prefix..." -ForegroundColor Cyan
  $previousPrefix = $env:NPM_CONFIG_PREFIX
  $env:NPM_CONFIG_PREFIX = $Prefix

  & $npmPath uninstall -g openclaw
  $exitCode = $LASTEXITCODE

  if ([string]::IsNullOrWhiteSpace($previousPrefix)) {
    Remove-Item Env:NPM_CONFIG_PREFIX -ErrorAction SilentlyContinue
  } else {
    $env:NPM_CONFIG_PREFIX = $previousPrefix
  }

  if ($exitCode -ne 0) {
    Write-Host "  WARN OpenClaw uninstall failed for $Prefix" -ForegroundColor Yellow
    return $false
  }

  return $true
}

function Remove-ManagerDirectory([bool]$PreserveFallbackPrefix) {
  if (-not (Test-Path $ManagerDir)) {
    Write-Host "  OK  Management console removed" -ForegroundColor Green
    return
  }

  $fallbackPrefix = Join-Path $ManagerDir "npm-global"
  if ($PreserveFallbackPrefix -and (Test-Path $fallbackPrefix)) {
    Get-ChildItem -Force $ManagerDir | Where-Object { $_.FullName -ne $fallbackPrefix } | Remove-Item -Recurse -Force
    Write-Host "  OK  Management console removed" -ForegroundColor Green
    Write-Host "  Kept $fallbackPrefix for OpenClaw CLI" -ForegroundColor DarkGray
    return
  }

  Remove-Item -Recurse -Force $ManagerDir
  Write-Host "  OK  Management console removed" -ForegroundColor Green
}

Write-Host ""
Write-Host "OpenClawUP Local - Windows Uninstaller" -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "  This will remove OpenClawUP Local and its Windows tasks. Continue? (y/N)"
if ($confirm -notin @("y", "Y")) {
  Write-Host "  Cancelled."
  exit 0
}

Write-Host ""
Write-Host "  Stopping and removing scheduled tasks..." -ForegroundColor Cyan
& schtasks /End /TN $TaskOpenClawName 2>$null | Out-Null
& schtasks /End /TN $TaskManagerName 2>$null | Out-Null
& schtasks /Delete /TN $TaskOpenClawName /F 2>$null | Out-Null
& schtasks /Delete /TN $TaskManagerName /F 2>$null | Out-Null
Write-Host "  OK  Tasks removed" -ForegroundColor Green

if (Test-Path $StartMenuDir) {
  Remove-Item -Recurse -Force $StartMenuDir
}
Write-Host "  OK  Start Menu shortcut removed" -ForegroundColor Green

Write-Host ""
$removeData = Read-Host "  Also remove OpenClaw config and data ($OpenClawDir)? (y/N)"
if ($removeData -in @("y", "Y")) {
  if (Test-Path $OpenClawDir) {
    Remove-Item -Recurse -Force $OpenClawDir
  }
  Write-Host "  OK  OpenClaw data removed" -ForegroundColor Green
} else {
  Write-Host "  Kept $OpenClawDir" -ForegroundColor DarkGray
}

Write-Host ""
$removeOpenClaw = Read-Host "  Also uninstall OpenClaw globally? (y/N)"
if ($removeOpenClaw -in @("y", "Y")) {
  $prefixes = [System.Collections.Generic.List[string]]::new()
  Add-CandidatePrefix $prefixes (Get-NpmGlobalPrefix)
  Add-CandidatePrefix $prefixes (Get-OpenClawInstallPrefix)
  Add-CandidatePrefix $prefixes (Join-Path $ManagerDir "npm-global")

  $removed = $false
  foreach ($prefix in $prefixes) {
    if (Uninstall-OpenClawFromPrefix $prefix) {
      $removed = $true
    }
  }

  if ($removed) {
    Write-Host "  OK  OpenClaw uninstalled" -ForegroundColor Green
  } else {
    Write-Host "  No OpenClaw install found in known npm prefixes" -ForegroundColor DarkGray
  }
} else {
  Write-Host "  Kept OpenClaw CLI" -ForegroundColor DarkGray
}

Write-Host ""
if ($removeOpenClaw -in @("y", "Y")) {
  Remove-ManagerDirectory $false
} else {
  Remove-ManagerDirectory $true
}

Write-Host ""
Write-Host "OpenClawUP Local has been uninstalled." -ForegroundColor Green
Write-Host ""
