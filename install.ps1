$ErrorActionPreference = "Stop"

$Version = "1.1.0"
$OpenClawDir = Join-Path $HOME ".openclaw"
$ManagerDir = Join-Path $env:LOCALAPPDATA "OpenClawUP Local"
$ManagerPort = 8080
$OpenClawUPApi = "https://openclawup.com"
$TaskOpenClawName = "OpenClawUP-OpenClaw"
$TaskManagerName = "OpenClawUP-Manager"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\OpenClawUP Local"

function Write-Info([string]$Message) {
  Write-Host "  |-- $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
  Write-Host "  |-- OK  $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
  Write-Host "  |-- WARN $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
  Write-Host "  |-- ERR $Message" -ForegroundColor Red
  exit 1
}

function Step([string]$Index, [string]$Message) {
  Write-Host ""
  Write-Host "[$Index] $Message" -ForegroundColor Magenta
}

function Show-Banner {
  Write-Host ""
  Write-Host "OpenClawUP Local for Windows" -ForegroundColor Green
  Write-Host "One-click install OpenClaw AI assistant on your PC" -ForegroundColor DarkGray
  Write-Host "Version $Version - $OpenClawUPApi" -ForegroundColor DarkGray
  Write-Host ""
}

function Convert-ToSingleQuotedLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Get-CommandPath([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command) {
    return $null
  }
  return $command.Source
}

function Ensure-Windows {
  if (-not $IsWindows) {
    Fail "This installer is for Windows only."
  }
  Write-Success "Windows $([System.Environment]::OSVersion.VersionString)"
}

function Add-CommonPaths {
  $nodeDir = "C:\Program Files\nodejs"
  $npmDir = Join-Path $env:APPDATA "npm"
  foreach ($path in @($nodeDir, $npmDir)) {
    if ((Test-Path $path) -and -not (($env:Path -split ";") -contains $path)) {
      $env:Path = "$path;$env:Path"
    }
  }
}

function Get-NodeMajorVersion {
  $nodePath = Get-CommandPath "node"
  if (-not $nodePath) {
    return $null
  }

  $version = & $nodePath --version
  if (-not $version) {
    return $null
  }

  return [int]($version.TrimStart("v").Split(".")[0])
}

function Ensure-Node {
  Add-CommonPaths
  $major = Get-NodeMajorVersion
  if ($major -and $major -ge 22) {
    Write-Success "Node.js $((& node --version).Trim())"
    return
  }

  $winget = Get-CommandPath "winget"
  if (-not $winget) {
    Fail "Node.js 22+ is required. Install winget or Node.js manually, then rerun this installer."
  }

  Write-Info "Installing Node.js via winget..."
  & $winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent | Out-Null
  Add-CommonPaths

  $major = Get-NodeMajorVersion
  if (-not $major -or $major -lt 22) {
    Fail "Failed to install Node.js 22+."
  }

  Write-Success "Node.js $((& node --version).Trim()) installed"
}

function Ensure-OpenClaw {
  Add-CommonPaths
  $openClawPath = Get-CommandPath "openclaw.cmd"
  if (-not $openClawPath) {
    $openClawPath = Get-CommandPath "openclaw"
  }

  if ($openClawPath) {
    $version = & $openClawPath --version 2>$null | Select-Object -First 1
    Write-Success "OpenClaw $version"
    return $openClawPath
  }

  Write-Info "Installing OpenClaw..."
  & npm install -g openclaw@latest | Out-Null
  Add-CommonPaths

  $openClawPath = Get-CommandPath "openclaw.cmd"
  if (-not $openClawPath) {
    $openClawPath = Get-CommandPath "openclaw"
  }

  if (-not $openClawPath) {
    Fail "Failed to install OpenClaw."
  }

  $version = & $openClawPath --version 2>$null | Select-Object -First 1
  Write-Success "OpenClaw $version installed"
  return $openClawPath
}

$PopularChannels = @("Telegram", "Discord", "WhatsApp", "Slack", "Signal")
$AllChannels = @(
  "Telegram", "Discord", "WhatsApp", "Slack", "Signal", "IRC", "Matrix", "Mattermost",
  "Microsoft Teams", "Google Chat", "LINE", "Feishu", "Twitch", "Nostr", "BlueBubbles",
  "Synology Chat", "Nextcloud Talk", "Tlon", "Zalo", "WebChat"
)

function Read-Choice([string]$Prompt, [int]$Default) {
  $raw = Read-Host $Prompt
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $Default
  }

  $parsed = 0
  if (-not [int]::TryParse($raw, [ref]$parsed)) {
    return -1
  }
  return $parsed
}

function Get-ChannelId([string]$Name) {
  return $Name.ToLowerInvariant().Replace(" ", "-")
}

function Get-ChannelEnvKey([string]$ChannelId) {
  return (($ChannelId.ToUpperInvariant() -replace "[^A-Z0-9]", "_") + "_BOT_TOKEN")
}

function Select-Channel {
  Write-Host ""
  Write-Host "Select a chat channel:" -ForegroundColor White
  Write-Host ""

  for ($i = 0; $i -lt $PopularChannels.Count; $i++) {
    Write-Host "  [$($i + 1)] $($PopularChannels[$i])" -ForegroundColor Cyan
  }
  Write-Host ""
  Write-Host "  [0] Show all channels" -ForegroundColor DarkGray
  Write-Host ""

  while ($true) {
    $choice = Read-Choice "  Enter number (1)" 1
    if ($choice -eq 0) {
      Write-Host ""
      for ($i = 0; $i -lt $AllChannels.Count; $i++) {
        Write-Host "  [$($i + 1)] $($AllChannels[$i])" -ForegroundColor Cyan
      }
      Write-Host ""
      $choice = Read-Choice "  Enter number" -1
      if ($choice -ge 1 -and $choice -le $AllChannels.Count) {
        $script:SelectedChannel = $AllChannels[$choice - 1]
        break
      }
    } elseif ($choice -ge 1 -and $choice -le $PopularChannels.Count) {
      $script:SelectedChannel = $PopularChannels[$choice - 1]
      break
    }

    Write-Warn "Invalid choice, try again"
  }

  Write-Success "Channel: $script:SelectedChannel"
}

function Get-BotToken {
  $channelId = Get-ChannelId $script:SelectedChannel
  if ($channelId -in @("whatsapp", "signal", "webchat", "bluebubbles")) {
    $script:BotToken = ""
    Write-Info "$($script:SelectedChannel) will be configured on first launch"
    return
  }

  Write-Host ""
  switch ($channelId) {
    "telegram" { Write-Host "  Get a bot token from @BotFather on Telegram" -ForegroundColor DarkGray }
    "discord" { Write-Host "  Get a bot token from discord.com/developers/applications" -ForegroundColor DarkGray }
    "slack" { Write-Host "  Get a bot token from api.slack.com/apps" -ForegroundColor DarkGray }
    default { Write-Host "  Enter your bot token for $($script:SelectedChannel)" -ForegroundColor DarkGray }
  }

  while ($true) {
    $token = Read-Host "  Bot Token"
    if (-not [string]::IsNullOrWhiteSpace($token)) {
      $script:BotToken = $token.Trim()
      Write-Success "Token saved"
      return
    }
    Write-Warn "Token cannot be empty"
  }
}

function Setup-ProxyAI {
  Write-Info "Opening browser to connect your OpenClawUP account..."
  $script:PairingToken = [guid]::NewGuid().ToString().ToLowerInvariant()
  Start-Process "$OpenClawUPApi/local/setup?pairingToken=$($script:PairingToken)" | Out-Null

  Write-Host ""
  Write-Host "  Complete these steps in your browser:" -ForegroundColor White
  Write-Host "  1. Sign in with Google" -ForegroundColor DarkGray
  Write-Host "  2. Add credits if needed" -ForegroundColor DarkGray
  Write-Host "  3. Come back here and wait for automatic pairing" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "  Waiting for setup to complete..." -ForegroundColor DarkGray -NoNewline

  for ($attempt = 0; $attempt -lt 180; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri "$OpenClawUPApi/api/local/pairing?token=$($script:PairingToken)" -Method Get
      if ($response.status -eq "ready" -and $response.apiKey) {
        $script:ProxyApiKey = $response.apiKey
        Write-Host ""
        Write-Success "Account connected"
        return
      }
    } catch {
      # Keep polling.
    }

    Start-Sleep -Seconds 5
    Write-Host "." -NoNewline
  }

  Write-Host ""
  Write-Warn "Timed out waiting for setup"
  $manualApiKey = Read-Host "  Paste your API Key manually (or press Enter to skip)"
  $script:ProxyApiKey = $manualApiKey.Trim()
}

function Setup-BYOKAI {
  Write-Host ""
  Write-Host "Select your AI provider:" -ForegroundColor White
  Write-Host ""
  Write-Host "  [1] OpenAI" -ForegroundColor Cyan
  Write-Host "  [2] OpenRouter" -ForegroundColor Cyan
  Write-Host "  [3] Other OpenAI-compatible API" -ForegroundColor Cyan
  Write-Host ""

  $choice = Read-Choice "  Enter number (1)" 1
  switch ($choice) {
    2 {
      $script:ByokProvider = "openrouter"
      $script:ByokBaseUrl = "https://openrouter.ai/api/v1"
      $script:ByokModel = "google/gemini-3-flash-preview"
    }
    3 {
      $script:ByokProvider = "custom"
      $script:ByokBaseUrl = Read-Host "  Base URL"
      $script:ByokModel = Read-Host "  Model name"
    }
    default {
      $script:ByokProvider = "openai"
      $script:ByokBaseUrl = "https://api.openai.com/v1"
      $script:ByokModel = "gpt-5"
    }
  }

  $apiKey = Read-Host "  API Key"
  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Fail "API Key is required for BYOK mode"
  }

  $script:ByokApiKey = $apiKey.Trim()
  Write-Success "Provider: $($script:ByokProvider) ($($script:ByokModel))"
}

function Select-AI {
  Write-Host ""
  Write-Host "AI Model Configuration:" -ForegroundColor White
  Write-Host ""
  Write-Host "  [1] OpenClawUP AI (recommended, multiple models, auto-routing, pay-as-you-go)" -ForegroundColor Cyan
  Write-Host "  [2] Use your own API Key (OpenAI or other OpenAI-compatible provider)" -ForegroundColor Cyan
  Write-Host ""

  while ($true) {
    $choice = Read-Choice "  Enter number (1)" 1
    switch ($choice) {
      1 {
        $script:AiMode = "proxy"
        Setup-ProxyAI
        return
      }
      2 {
        $script:AiMode = "byok"
        Setup-BYOKAI
        return
      }
      default {
        Write-Warn "Invalid choice, try again"
      }
    }
  }
}

function Generate-Config {
  New-Item -ItemType Directory -Force -Path $OpenClawDir | Out-Null

  $channelId = Get-ChannelId $script:SelectedChannel
  $channelEnvKey = Get-ChannelEnvKey $channelId
  $tokenRef = '${' + $channelEnvKey + '}'
  $channels = [ordered]@{}

  switch ($channelId) {
    "telegram" {
      $channels.telegram = [ordered]@{
        enabled = $true
        botToken = $tokenRef
        dmPolicy = "open"
        streaming = "partial"
      }
    }
    "discord" {
      $channels.discord = [ordered]@{
        enabled = $true
        token = $tokenRef
      }
    }
    "whatsapp" {
      $channels.whatsapp = [ordered]@{
        enabled = $true
        dmPolicy = "pairing"
      }
    }
    "slack" {
      $channels.slack = [ordered]@{
        enabled = $true
        token = $tokenRef
      }
    }
    "signal" {
      $channels.signal = [ordered]@{
        enabled = $true
      }
    }
    default {
      $channelConfig = [ordered]@{ enabled = $true }
      if (-not [string]::IsNullOrWhiteSpace($script:BotToken)) {
        $channelConfig.token = $tokenRef
      }
      $channels[$channelId] = $channelConfig
    }
  }

  if ($script:AiMode -eq "proxy") {
    $providers = [ordered]@{
      openclawup = [ordered]@{
        baseUrl = "$OpenClawUPApi/api/ai/v1"
        apiKey = '${OPENCLAWUP_API_KEY}'
        api = "openai-completions"
        models = @(
          @{ id = "auto"; name = "Auto Routing" },
          @{ id = "gemini-3-flash"; name = "Gemini 3 Flash" },
          @{ id = "gpt-5.4"; name = "GPT-5.4" },
          @{ id = "claude-sonnet-4.6"; name = "Claude Sonnet 4.6" },
          @{ id = "deepseek-v3.2"; name = "DeepSeek V3.2" },
          @{ id = "qwen-3.5-plus"; name = "Qwen 3.5" },
          @{ id = "glm-5"; name = "GLM-5" },
          @{ id = "minimax-m2.5"; name = "MiniMax M2.5" },
          @{ id = "kimi-k2.5"; name = "Kimi K2.5" },
          @{ id = "claude-opus-4.5"; name = "Claude Opus 4.5" }
        )
      }
    }
    $defaultModel = "openclawup/auto"
  } else {
    $providers = [ordered]@{
      $script:ByokProvider = [ordered]@{
        baseUrl = $script:ByokBaseUrl
        apiKey = '${BYOK_API_KEY}'
        api = "openai-completions"
        models = @(
          @{ id = $script:ByokModel; name = $script:ByokModel }
        )
      }
    }
    $defaultModel = "$($script:ByokProvider)/$($script:ByokModel)"
  }

  $config = [ordered]@{
    channels = $channels
    models = [ordered]@{
      providers = $providers
    }
    agents = [ordered]@{
      defaults = [ordered]@{
        model = [ordered]@{
          primary = $defaultModel
        }
      }
    }
  }

  $configPath = Join-Path $OpenClawDir "openclaw.json"
  $envPath = Join-Path $OpenClawDir ".env"
  $config | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8

  $envLines = @()
  if ($script:AiMode -eq "proxy") {
    $envLines += "OPENCLAWUP_API_KEY=$($script:ProxyApiKey)"
  } else {
    $envLines += "BYOK_API_KEY=$($script:ByokApiKey)"
  }
  if (-not [string]::IsNullOrWhiteSpace($script:BotToken)) {
    $envLines += "$channelEnvKey=$($script:BotToken)"
  }
  Set-Content -Path $envPath -Value ($envLines -join [Environment]::NewLine) -Encoding UTF8

  Write-Success "Configuration generated at $OpenClawDir"
}

function Install-Manager {
  New-Item -ItemType Directory -Force -Path $ManagerDir | Out-Null
  $publicDir = Join-Path $ManagerDir "public"
  New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

  $localManagerDir = Join-Path $PSScriptRoot "manager"
  if (Test-Path (Join-Path $localManagerDir "server.mjs")) {
    Copy-Item (Join-Path $localManagerDir "server.mjs") (Join-Path $ManagerDir "server.mjs") -Force
    Copy-Item (Join-Path $localManagerDir "public\index.html") (Join-Path $publicDir "index.html") -Force
  } else {
    Write-Info "Downloading management console..."
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/OpenClawUP/local/main/manager/server.mjs" -OutFile (Join-Path $ManagerDir "server.mjs")
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/OpenClawUP/local/main/manager/public/index.html" -OutFile (Join-Path $publicDir "index.html")
  }

  Write-Success "Management console installed"
}

function Write-LauncherScripts([string]$OpenClawPath) {
  New-Item -ItemType Directory -Force -Path (Join-Path $OpenClawDir "logs") | Out-Null
  New-Item -ItemType Directory -Force -Path $ManagerDir | Out-Null

  $startOpenClawPath = Join-Path $ManagerDir "start-openclaw.ps1"
  $startManagerPath = Join-Path $ManagerDir "start-manager.ps1"
  $nodePath = Get-CommandPath "node"
  if (-not $nodePath) {
    Fail "Node.js executable not found after installation"
  }

  $openClawLiteral = Convert-ToSingleQuotedLiteral $OpenClawPath
  $nodeLiteral = Convert-ToSingleQuotedLiteral $nodePath
  $openClawDirLiteral = Convert-ToSingleQuotedLiteral $OpenClawDir
  $managerDirLiteral = Convert-ToSingleQuotedLiteral $ManagerDir
  $serverLiteral = Convert-ToSingleQuotedLiteral (Join-Path $ManagerDir "server.mjs")
  $homeLiteral = Convert-ToSingleQuotedLiteral $HOME

  $openClawScript = @(
    '$ErrorActionPreference = "Stop"',
    '$env:OPENCLAW_DIR = ' + $openClawDirLiteral,
    '$env:HOME = ' + $homeLiteral,
    '$logDir = Join-Path $env:OPENCLAW_DIR "logs"',
    'New-Item -ItemType Directory -Force -Path $logDir | Out-Null',
    '$stdout = Join-Path $logDir "gateway.log"',
    '$stderr = Join-Path $logDir "gateway.err"',
    '& ' + $openClawLiteral + ' gateway --port 18789 1>> $stdout 2>> $stderr'
  )
  Set-Content -Path $startOpenClawPath -Value ($openClawScript -join [Environment]::NewLine) -Encoding UTF8

  $managerScript = @(
    '$ErrorActionPreference = "Stop"',
    '$env:PORT = "' + $ManagerPort + '"',
    '$env:OPENCLAW_DIR = ' + $openClawDirLiteral,
    '$env:OPENCLAWUP_MANAGER_DIR = ' + $managerDirLiteral,
    '$env:HOME = ' + $homeLiteral,
    '$stdout = Join-Path $env:OPENCLAWUP_MANAGER_DIR "manager.log"',
    '$stderr = Join-Path $env:OPENCLAWUP_MANAGER_DIR "manager.err"',
    '& ' + $nodeLiteral + ' ' + $serverLiteral + ' 1>> $stdout 2>> $stderr'
  )
  Set-Content -Path $startManagerPath -Value ($managerScript -join [Environment]::NewLine) -Encoding UTF8

  Write-Success "Launcher scripts written"
}

function Register-Tasks {
  $managerScriptPath = Join-Path $ManagerDir "start-manager.ps1"
  $openClawScriptPath = Join-Path $ManagerDir "start-openclaw.ps1"
  $managerTaskCommand = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$managerScriptPath`""
  $openClawTaskCommand = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$openClawScriptPath`""

  & schtasks /Delete /TN $TaskManagerName /F 2>$null | Out-Null
  & schtasks /Delete /TN $TaskOpenClawName /F 2>$null | Out-Null

  & schtasks /Create /SC ONLOGON /TN $TaskManagerName /TR $managerTaskCommand /F | Out-Null
  & schtasks /Create /SC ONLOGON /TN $TaskOpenClawName /TR $openClawTaskCommand /F | Out-Null

  Write-Success "Scheduled tasks registered (auto-start on login)"
}

function Start-Tasks {
  & schtasks /Run /TN $TaskManagerName | Out-Null
  & schtasks /Run /TN $TaskOpenClawName | Out-Null
  Start-Sleep -Seconds 2
  Write-Success "Services started"
}

function Create-Shortcut {
  New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
  $shortcutPath = Join-Path $StartMenuDir "OpenClawUP Local.url"
  $shortcutContent = @(
    "[InternetShortcut]",
    "URL=http://localhost:$ManagerPort"
  )
  Set-Content -Path $shortcutPath -Value $shortcutContent -Encoding ASCII
  Write-Success "Start Menu shortcut created"
}

function Complete {
  Write-Host ""
  Write-Host "Installation complete." -ForegroundColor Green
  Write-Host ""
  Write-Host "Next steps:" -ForegroundColor White
  Write-Host ""

  switch (Get-ChannelId $script:SelectedChannel) {
    "telegram" { Write-Host "  -> Open Telegram and message your bot" -ForegroundColor Cyan }
    "discord" { Write-Host "  -> Invite your bot to a Discord server and @mention it" -ForegroundColor Cyan }
    "whatsapp" { Write-Host "  -> Open the management page to finish pairing" -ForegroundColor Cyan }
    default { Write-Host "  -> Your $($script:SelectedChannel) bot is now running" -ForegroundColor Cyan }
  }

  Write-Host "  -> Manage at http://localhost:$ManagerPort" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "OpenClaw runs in the background and starts automatically when you sign in." -ForegroundColor DarkGray
  Write-Host "To uninstall later: run uninstall.bat or uninstall.ps1" -ForegroundColor DarkGray
  Write-Host ""

  Start-Process "http://localhost:$ManagerPort" | Out-Null
}

Show-Banner

Step "1/6" "Checking environment"
Ensure-Windows
Ensure-Node

Step "2/6" "Installing OpenClaw"
$OpenClawPath = Ensure-OpenClaw

Step "3/6" "Channel setup"
Select-Channel
Get-BotToken

Step "4/6" "AI model configuration"
Select-AI

Step "5/6" "Configuring and installing"
Generate-Config
Install-Manager
Write-LauncherScripts -OpenClawPath $OpenClawPath
Register-Tasks
Create-Shortcut

Step "6/6" "Starting services"
Start-Tasks

Complete
