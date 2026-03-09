$ErrorActionPreference = "Stop"

$OpenClawDir = Join-Path $HOME ".openclaw"
$ManagerDir = Join-Path $env:LOCALAPPDATA "OpenClawUP Local"
$TaskOpenClawName = "OpenClawUP-OpenClaw"
$TaskManagerName = "OpenClawUP-Manager"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\OpenClawUP Local"

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

if (Test-Path $ManagerDir) {
  Remove-Item -Recurse -Force $ManagerDir
}
Write-Host "  OK  Management console removed" -ForegroundColor Green

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
  & npm uninstall -g openclaw 2>$null | Out-Null
  Write-Host "  OK  OpenClaw uninstalled" -ForegroundColor Green
} else {
  Write-Host "  Kept OpenClaw CLI" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "OpenClawUP Local has been uninstalled." -ForegroundColor Green
Write-Host ""
