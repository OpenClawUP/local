#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# OpenClawUP Local Installer
# https://openclawup.com/install
# ─────────────────────────────────────────────────────────────

VERSION="1.0.0"
OPENCLAW_DIR="$HOME/.openclaw"
MANAGER_DIR="$HOME/.openclawup-local"
MANAGER_PORT=8080
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
APP_DIR="/Applications/OpenClawUP Local.app"
OPENCLAWUP_API="https://openclawup.com"
NPM_GLOBAL_PREFIX=""
NPM_GLOBAL_BIN=""

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Helpers ─────────────────────────────────────────────────
info()    { echo -e "${BLUE}  ├── ${RESET}$1"; }
success() { echo -e "${GREEN}  ├── ✓${RESET} $1"; }
warn()    { echo -e "${YELLOW}  ├── ⚠${RESET} $1"; }
fail()    { echo -e "${RED}  └── ✗ $1${RESET}"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}  [$1]${RESET} ${BOLD}$2${RESET}"; }

path_contains() {
  local dir="$1"
  [[ -n "$dir" && ":$PATH:" == *":$dir:"* ]]
}

prepend_path() {
  local dir="$1"
  [[ -n "$dir" ]] || return 0
  if [[ -d "$dir" ]] && ! path_contains "$dir"; then
    export PATH="$dir:$PATH"
  fi
}

current_npm_prefix() {
  local prefix=""
  if prefix=$(npm prefix -g 2>/dev/null); then
    :
  else
    prefix=$(npm config get prefix 2>/dev/null || true)
  fi

  if [[ "$prefix" == "undefined" || "$prefix" == "null" ]]; then
    prefix=""
  fi

  printf '%s' "$prefix"
}

can_write_dir() {
  local dir="$1"
  local probe_dir="$dir"
  if [[ ! -d "$probe_dir" ]]; then
    probe_dir=$(dirname "$probe_dir")
  fi

  mkdir -p "$probe_dir" 2>/dev/null || return 1

  local probe="$probe_dir/.openclawup-write-test-$$"
  if touch "$probe" 2>/dev/null; then
    rm -f "$probe"
    return 0
  fi

  return 1
}

prepare_npm_runtime() {
  local prefix=""
  prefix=$(current_npm_prefix)
  if [[ -n "$prefix" ]]; then
    NPM_GLOBAL_PREFIX="$prefix"
    NPM_GLOBAL_BIN="$prefix/bin"
    prepend_path "$NPM_GLOBAL_BIN"
  fi
}

use_npm_prefix() {
  local prefix="$1"
  mkdir -p "$prefix/bin" "$prefix/lib/node_modules"
  export NPM_CONFIG_PREFIX="$prefix"
  NPM_GLOBAL_PREFIX="$prefix"
  NPM_GLOBAL_BIN="$prefix/bin"
  prepend_path "$NPM_GLOBAL_BIN"
}

prepare_npm_install_prefix() {
  local prefix=""
  prefix=$(current_npm_prefix)

  if [[ -n "$prefix" ]] && can_write_dir "$prefix"; then
    use_npm_prefix "$prefix"
    return 0
  fi

  local fallback_prefix="$MANAGER_DIR/npm-global"
  if [[ -n "$prefix" ]]; then
    warn "npm global prefix is not writable: $prefix"
  fi
  warn "Using user-scoped npm prefix: $fallback_prefix"
  use_npm_prefix "$fallback_prefix"
}

banner() {
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "   ___                    ____ _                _   _ ____  "
  echo "  / _ \ _ __   ___ _ __ / ___| | __ ___      _| | | |  _ \ "
  echo " | | | | '_ \ / _ \ '_ \ |   | |/ _\` \ \ /\ / / | | | |_) |"
  echo " | |_| | |_) |  __/ | | | |___| | (_| |\ V  V /| |_| |  __/ "
  echo "  \___/| .__/ \___|_| |_|\____|_|\__,_| \_/\_/  \___/|_|    "
  echo "       |_|                                          Local    "
  echo -e "${RESET}"
  echo -e "  ${DIM}One-click install OpenClaw AI assistant on your Mac${RESET}"
  echo -e "  ${DIM}Version $VERSION · https://openclawup.com${RESET}"
  echo ""
}

# ── 1. Check environment ────────────────────────────────────
check_os() {
  if [[ "$(uname)" != "Darwin" ]]; then
    fail "This installer is for macOS only. For Linux, see docs."
  fi
  local arch
  arch=$(uname -m)
  local macos_ver
  macos_ver=$(sw_vers -productVersion)
  success "macOS $macos_ver ($arch)"
}

check_node() {
  if command -v node &>/dev/null; then
    local ver
    ver=$(node -v | sed 's/v//')
    local major
    major=$(echo "$ver" | cut -d. -f1)
    if [[ "$major" -ge 22 ]]; then
      success "Node.js v$ver"
      return 0
    else
      warn "Node.js v$ver found, but v22+ required"
      return 1
    fi
  else
    info "Node.js not found"
    return 1
  fi
}

install_node() {
  info "Installing Node.js 22..."

  if command -v brew &>/dev/null; then
    info "Using Homebrew..."
    brew install node@22 2>/dev/null || brew upgrade node@22 2>/dev/null || true
    # Ensure node@22 is in PATH
    if [[ -d "$(brew --prefix)/opt/node@22/bin" ]]; then
      export PATH="$(brew --prefix)/opt/node@22/bin:$PATH"
    fi
  else
    info "Downloading official installer..."
    local arch
    arch=$(uname -m)
    local pkg_arch="arm64"
    if [[ "$arch" == "x86_64" ]]; then
      pkg_arch="x64"
    fi
    local pkg_url="https://nodejs.org/dist/v22.14.0/node-v22.14.0-darwin-${pkg_arch}.pkg"
    local tmp_pkg="/tmp/nodejs-22.pkg"
    curl -fsSL "$pkg_url" -o "$tmp_pkg"
    sudo installer -pkg "$tmp_pkg" -target / 2>/dev/null
    rm -f "$tmp_pkg"
  fi

  # Verify
  if command -v node &>/dev/null; then
    local ver
    ver=$(node -v | sed 's/v//')
    success "Node.js v$ver installed"
  else
    fail "Failed to install Node.js. Please install manually: https://nodejs.org"
  fi
}

check_openclaw() {
  prepare_npm_runtime
  if command -v openclaw &>/dev/null; then
    local ver
    ver=$(openclaw --version 2>/dev/null | head -1 || echo "unknown")
    success "OpenClaw $ver"
    return 0
  else
    return 1
  fi
}

install_openclaw() {
  info "Installing OpenClaw..."
  prepare_npm_install_prefix

  if ! npm install -g openclaw@latest; then
    fail "Failed to install OpenClaw with npm. Prefix: ${NPM_GLOBAL_PREFIX:-unknown}"
  fi

  if command -v openclaw &>/dev/null; then
    local ver
    ver=$(openclaw --version 2>/dev/null | head -1 || echo "unknown")
    success "OpenClaw $ver installed"
  else
    fail "OpenClaw installed but command not found on PATH. Prefix: ${NPM_GLOBAL_PREFIX:-unknown}"
  fi
}

# ── 2. Channel selection ────────────────────────────────────

CHANNELS_POPULAR=(
  "Telegram"
  "Discord"
  "WhatsApp"
  "Slack"
  "Signal"
)

CHANNELS_ALL=(
  "Telegram"
  "Discord"
  "WhatsApp"
  "Slack"
  "Signal"
  "IRC"
  "Matrix"
  "Mattermost"
  "Microsoft Teams"
  "Google Chat"
  "LINE"
  "Feishu"
  "Twitch"
  "Nostr"
  "BlueBubbles"
  "Synology Chat"
  "Nextcloud Talk"
  "Tlon"
  "Zalo"
  "WebChat"
)

select_channel() {
  echo ""
  echo -e "  ${BOLD}Select a chat channel:${RESET}"
  echo ""

  for i in "${!CHANNELS_POPULAR[@]}"; do
    echo -e "  ${CYAN}[$((i+1))]${RESET} ${CHANNELS_POPULAR[$i]}"
  done
  echo ""
  echo -e "  ${DIM}[0] Show all channels...${RESET}"
  echo ""

  while true; do
    read -rp "  Enter number (1): " choice < /dev/tty
    choice=${choice:-1}

    if [[ "$choice" == "0" ]]; then
      echo ""
      for i in "${!CHANNELS_ALL[@]}"; do
        echo -e "  ${CYAN}[$((i+1))]${RESET} ${CHANNELS_ALL[$i]}"
      done
      echo ""
      read -rp "  Enter number: " choice < /dev/tty
      if [[ "$choice" -ge 1 && "$choice" -le "${#CHANNELS_ALL[@]}" ]]; then
        SELECTED_CHANNEL="${CHANNELS_ALL[$((choice-1))]}"
        break
      else
        warn "Invalid choice, try again"
      fi
    elif [[ "$choice" -ge 1 && "$choice" -le "${#CHANNELS_POPULAR[@]}" ]]; then
      SELECTED_CHANNEL="${CHANNELS_POPULAR[$((choice-1))]}"
      break
    else
      warn "Invalid choice, try again"
    fi
  done

  success "Channel: $SELECTED_CHANNEL"
}

get_channel_id() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-'
}

get_channel_env_key() {
  local channel_id
  channel_id="$1"
  local normalized
  normalized=$(printf '%s' "$channel_id" | tr '[:lower:]' '[:upper:]' | sed 's/[^A-Z0-9]/_/g')
  echo "${normalized}_BOT_TOKEN"
}

get_bot_token() {
  local channel_id
  channel_id=$(get_channel_id "$SELECTED_CHANNEL")

  case "$channel_id" in
    whatsapp|signal|webchat|bluebubbles)
      # These don't need a token
      BOT_TOKEN=""
      info "$SELECTED_CHANNEL will be configured on first launch"
      return
      ;;
  esac

  echo ""
  case "$channel_id" in
    telegram)
      echo -e "  ${DIM}Get a bot token from @BotFather on Telegram${RESET}"
      ;;
    discord)
      echo -e "  ${DIM}Get a bot token from discord.com/developers/applications${RESET}"
      ;;
    slack)
      echo -e "  ${DIM}Get a bot token from api.slack.com/apps${RESET}"
      ;;
    *)
      echo -e "  ${DIM}Enter your bot token for $SELECTED_CHANNEL${RESET}"
      ;;
  esac

  while true; do
    read -rp "  Bot Token: " BOT_TOKEN < /dev/tty
    if [[ -n "$BOT_TOKEN" ]]; then
      success "Token saved"
      break
    else
      warn "Token cannot be empty"
    fi
  done
}

# ── 3. AI model configuration ──────────────────────────────

select_ai() {
  echo ""
  echo -e "  ${BOLD}AI Model Configuration:${RESET}"
  echo ""
  echo -e "  ${CYAN}[1]${RESET} Use your own API Key ${DIM}(OpenAI, OpenRouter, or compatible)${RESET}"
  echo -e "  ${CYAN}[2]${RESET} OpenClawUP AI ${DIM}(multiple models, auto-routing, pay-as-you-go)${RESET}"
  echo ""

  while true; do
    read -rp "  Enter number (1): " ai_choice < /dev/tty
    ai_choice=${ai_choice:-1}

    case "$ai_choice" in
      1)
        AI_MODE="byok"
        setup_byok_ai
        break
        ;;
      2)
        AI_MODE="proxy"
        setup_proxy_ai
        break
        ;;
      *)
        warn "Invalid choice, try again"
        ;;
    esac
  done
}

setup_proxy_ai() {
  info "Opening browser to create your OpenClawUP account..."
  echo ""

  # Generate a temporary pairing token
  PAIRING_TOKEN=$(uuidgen | tr '[:upper:]' '[:lower:]')

  # Open browser for registration + payment
  open "${OPENCLAWUP_API}/local/setup?pairingToken=${PAIRING_TOKEN}" 2>/dev/null || true

  echo -e "  ${BOLD}Complete these steps in your browser:${RESET}"
  echo -e "  ${DIM}1. Sign in with Google${RESET}"
  echo -e "  ${DIM}2. Add credits via PayPal${RESET}"
  echo -e "  ${DIM}3. Come back here — it will detect automatically${RESET}"
  echo ""
  echo -e "  ${DIM}Waiting for setup to complete...${RESET}"

  # Poll for completion
  local attempts=0
  local max_attempts=180  # 15 minutes
  while [[ $attempts -lt $max_attempts ]]; do
    local response
    response=$(curl -s "${OPENCLAWUP_API}/api/local/pairing?token=${PAIRING_TOKEN}" 2>/dev/null || echo "")

    if echo "$response" | grep -q '"status":"ready"'; then
      PROXY_API_KEY=$(echo "$response" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
      if [[ -n "$PROXY_API_KEY" ]]; then
        echo ""
        success "Account connected!"
        return
      fi
    fi

    sleep 5
    attempts=$((attempts + 1))
    # Show a dot every 5 seconds
    printf "."
  done

  echo ""
  warn "Timed out waiting for setup"
  echo ""
  read -rp "  Paste your API Key manually (or press Enter to skip): " PROXY_API_KEY < /dev/tty

  if [[ -n "$PROXY_API_KEY" ]]; then
    success "API Key saved"
  else
    warn "No API Key configured. Bot will show a setup message until configured."
    PROXY_API_KEY=""
  fi
}

setup_byok_ai() {
  echo ""
  echo -e "  ${BOLD}Select your AI provider:${RESET}"
  echo ""
  echo -e "  ${CYAN}[1]${RESET} OpenAI          ${DIM}(GPT-5)${RESET}"
  echo -e "  ${CYAN}[2]${RESET} Google Gemini   ${DIM}(Gemini 2.5 Flash)${RESET}"
  echo -e "  ${CYAN}[3]${RESET} Anthropic       ${DIM}(Claude Sonnet 4)${RESET}"
  echo -e "  ${CYAN}[4]${RESET} DeepSeek        ${DIM}(DeepSeek V3)${RESET}"
  echo -e "  ${CYAN}[5]${RESET} OpenRouter      ${DIM}(multi-provider, 300+ models)${RESET}"
  echo -e "  ${CYAN}[6]${RESET} Groq            ${DIM}(Llama 4, ultra-fast)${RESET}"
  echo -e "  ${CYAN}[7]${RESET} Mistral         ${DIM}(Mistral Large)${RESET}"
  echo -e "  ${CYAN}[0]${RESET} Other           ${DIM}(enter API URL manually)${RESET}"
  echo ""

  read -rp "  Enter number (1): " provider_choice < /dev/tty
  provider_choice=${provider_choice:-1}

  case "$provider_choice" in
    1) BYOK_PROVIDER="openai";     BYOK_BASE_URL="https://api.openai.com/v1";                              BYOK_MODEL="gpt-5";                                          BYOK_DISPLAY="GPT-5";                          BYOK_API="openai-completions" ;;
    2) BYOK_PROVIDER="google";     BYOK_BASE_URL="https://generativelanguage.googleapis.com/v1beta";       BYOK_MODEL="gemini-2.5-flash";                                BYOK_DISPLAY="Gemini 2.5 Flash";               BYOK_API="google-generative-ai" ;;
    3) BYOK_PROVIDER="anthropic";  BYOK_BASE_URL="https://api.anthropic.com/v1";                            BYOK_MODEL="claude-sonnet-4-20250514";                        BYOK_DISPLAY="Claude Sonnet 4";                BYOK_API="anthropic-messages" ;;
    4) BYOK_PROVIDER="deepseek";   BYOK_BASE_URL="https://api.deepseek.com/v1";                             BYOK_MODEL="deepseek-chat";                                   BYOK_DISPLAY="DeepSeek V3";                    BYOK_API="openai-completions" ;;
    5) BYOK_PROVIDER="openrouter"; BYOK_BASE_URL="https://openrouter.ai/api/v1";                            BYOK_MODEL="google/gemini-2.5-flash-preview";                 BYOK_DISPLAY="Gemini 2.5 Flash (OpenRouter)";  BYOK_API="openai-completions" ;;
    6) BYOK_PROVIDER="groq";       BYOK_BASE_URL="https://api.groq.com/openai/v1";                          BYOK_MODEL="meta-llama/llama-4-scout-17b-16e-instruct";       BYOK_DISPLAY="Llama 4 Scout";                  BYOK_API="openai-completions" ;;
    7) BYOK_PROVIDER="mistral";    BYOK_BASE_URL="https://api.mistral.ai/v1";                               BYOK_MODEL="mistral-large-latest";                            BYOK_DISPLAY="Mistral Large";                  BYOK_API="openai-completions" ;;
    0)
      echo ""
      echo -e "  ${DIM}API endpoint URL, e.g. https://api.example.com/v1${RESET}"
      read -rp "  API URL: " BYOK_BASE_URL < /dev/tty
      read -rp "  Model ID: " BYOK_MODEL < /dev/tty
      read -rp "  Display name (optional): " BYOK_DISPLAY < /dev/tty
      BYOK_DISPLAY=${BYOK_DISPLAY:-$BYOK_MODEL}
      BYOK_PROVIDER="custom"
      BYOK_API="openai-completions"
      ;;
    *) BYOK_PROVIDER="openai"; BYOK_BASE_URL="https://api.openai.com/v1"; BYOK_MODEL="gpt-5"; BYOK_DISPLAY="GPT-5"; BYOK_API="openai-completions" ;;
  esac

  read -rp "  API Key: " BYOK_API_KEY < /dev/tty
  if [[ -z "$BYOK_API_KEY" ]]; then
    fail "API Key is required for BYOK mode"
  fi
  success "Provider: $BYOK_PROVIDER ($BYOK_MODEL)"
}

# ── 4. Generate configuration ──────────────────────────────

generate_config() {
  mkdir -p "$OPENCLAW_DIR"

  local channel_id
  channel_id=$(get_channel_id "$SELECTED_CHANNEL")
  local channel_env_key
  channel_env_key=$(get_channel_env_key "$channel_id")
  local token_ref
  printf -v token_ref '${%s}' "$channel_env_key"

  # Build channel config
  local channel_block=""
  case "$channel_id" in
    telegram)
      channel_block="\"telegram\": { \"enabled\": true, \"botToken\": \"$token_ref\", \"dmPolicy\": \"open\", \"allowFrom\": [\"*\"], \"streaming\": \"partial\" }"
      ;;
    discord)
      channel_block="\"discord\": { \"enabled\": true, \"token\": \"$token_ref\" }"
      ;;
    whatsapp)
      channel_block="\"whatsapp\": { \"enabled\": true, \"dmPolicy\": \"pairing\" }"
      ;;
    slack)
      channel_block="\"slack\": { \"enabled\": true, \"token\": \"$token_ref\" }"
      ;;
    signal)
      channel_block="\"signal\": { \"enabled\": true }"
      ;;
    *)
      if [[ -n "$BOT_TOKEN" ]]; then
        channel_block="\"$channel_id\": { \"enabled\": true, \"token\": \"$token_ref\" }"
      else
        channel_block="\"$channel_id\": { \"enabled\": true }"
      fi
      ;;
  esac

  # Build model config
  local models_block=""
  if [[ "$AI_MODE" == "proxy" ]]; then
    models_block='"providers": {
        "openclawup": {
          "baseUrl": "'"${OPENCLAWUP_API}"'/api/ai/v1",
          "apiKey": "${OPENCLAWUP_API_KEY}",
          "api": "openai-completions",
          "models": [
            { "id": "auto", "name": "Auto Routing" },
            { "id": "gemini-3-flash", "name": "Gemini 3 Flash" },
            { "id": "gpt-5.4", "name": "GPT-5.4" },
            { "id": "claude-sonnet-4.6", "name": "Claude Sonnet 4.6" },
            { "id": "deepseek-v3.2", "name": "DeepSeek V3.2" },
            { "id": "qwen-3.5-plus", "name": "Qwen 3.5" },
            { "id": "glm-5", "name": "GLM-5" },
            { "id": "minimax-m2.5", "name": "MiniMax M2.5" },
            { "id": "kimi-k2.5", "name": "Kimi K2.5" },
            { "id": "claude-opus-4.5", "name": "Claude Opus 4.5" }
          ]
        }
      }'
    local default_model="openclawup/auto"
  else
    models_block='"providers": {
        "'"$BYOK_PROVIDER"'": {
          "baseUrl": "'"$BYOK_BASE_URL"'",
          "apiKey": "${BYOK_API_KEY}",
          "api": "'"${BYOK_API:-openai-completions}"'",
          "models": [
            { "id": "'"$BYOK_MODEL"'", "name": "'"${BYOK_DISPLAY:-$BYOK_MODEL}"'" }
          ]
        }
      }'
    local default_model="${BYOK_PROVIDER}/${BYOK_MODEL}"
  fi

  # Write openclaw.json
  cat > "$OPENCLAW_DIR/openclaw.json" << JSONEOF
{
  "gateway": {
    "mode": "local"
  },
  "channels": {
    $channel_block
  },
  "models": {
    $models_block
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "$default_model"
      }
    }
  }
}
JSONEOF

  # Write .env
  local env_content=""
  if [[ "$AI_MODE" == "proxy" ]]; then
    env_content="OPENCLAWUP_API_KEY=${PROXY_API_KEY}"
  else
    env_content="BYOK_API_KEY=${BYOK_API_KEY}"
  fi

  # Add bot token
  if [[ -n "$BOT_TOKEN" ]]; then
    env_content="${env_content}\n${channel_env_key}=${BOT_TOKEN}"
  fi

  echo -e "$env_content" > "$OPENCLAW_DIR/.env"

  success "Configuration generated at $OPENCLAW_DIR/"
}

# ── 5. Install manager ─────────────────────────────────────

install_manager() {
  mkdir -p "$MANAGER_DIR"

  # Copy manager files (local clone) or download (curl|bash)
  local script_dir="${BASH_SOURCE[0]:-}"
  if [[ -n "$script_dir" ]]; then
    script_dir="$(cd "$(dirname "$script_dir")" && pwd)"
  fi

  if [[ -n "$script_dir" && -d "$script_dir/manager" ]]; then
    cp -r "$script_dir/manager/"* "$MANAGER_DIR/"
  else
    # Download manager from GitHub if running via curl
    info "Downloading management console..."
    curl -fsSL "https://raw.githubusercontent.com/openclawup/local/main/manager/server.mjs" -o "$MANAGER_DIR/server.mjs"
    mkdir -p "$MANAGER_DIR/public"
    curl -fsSL "https://raw.githubusercontent.com/openclawup/local/main/manager/public/index.html" -o "$MANAGER_DIR/public/index.html"
  fi

  success "Management console installed"
}

# ── 6. Register launchd services ────────────────────────────

register_services() {
  mkdir -p "$LAUNCH_AGENTS_DIR"

  local node_path
  node_path=$(which node)
  local openclaw_path
  openclaw_path=$(which openclaw)
  local launch_path
  launch_path="/usr/local/bin:/usr/bin:/bin:$(dirname "$node_path")"
  if [[ -n "$NPM_GLOBAL_BIN" ]]; then
    launch_path="$NPM_GLOBAL_BIN:$launch_path"
  fi

  # OpenClaw service
  cat > "$LAUNCH_AGENTS_DIR/com.openclawup.openclaw.plist" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclawup.openclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>$openclaw_path</string>
    <string>gateway</string>
    <string>--port</string>
    <string>18789</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$OPENCLAW_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$launch_path</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$OPENCLAW_DIR/logs/gateway.log</string>
  <key>StandardErrorPath</key>
  <string>$OPENCLAW_DIR/logs/gateway.err</string>
</dict>
</plist>
PLISTEOF

  # Manager service
  cat > "$LAUNCH_AGENTS_DIR/com.openclawup.manager.plist" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclawup.manager</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_path</string>
    <string>$MANAGER_DIR/server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$MANAGER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$launch_path</string>
    <key>PORT</key>
    <string>$MANAGER_PORT</string>
    <key>OPENCLAW_DIR</key>
    <string>$OPENCLAW_DIR</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$MANAGER_DIR/manager.log</string>
  <key>StandardErrorPath</key>
  <string>$MANAGER_DIR/manager.err</string>
</dict>
</plist>
PLISTEOF

  success "Launch services registered (auto-start on login)"
}

# ── 7. Create macOS app ─────────────────────────────────────

create_app() {
  local app_contents="$APP_DIR/Contents"
  local app_macos="$app_contents/MacOS"
  local app_resources="$app_contents/Resources"

  mkdir -p "$app_macos" "$app_resources"

  # Launcher script
  cat > "$app_macos/launcher" << 'LAUNCHEREOF'
#!/bin/bash
open http://localhost:8080
LAUNCHEREOF
  chmod +x "$app_macos/launcher"

  # Info.plist
  cat > "$app_contents/Info.plist" << 'INFOPLISTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>OpenClawUP Local</string>
  <key>CFBundleDisplayName</key>
  <string>OpenClawUP Local</string>
  <key>CFBundleIdentifier</key>
  <string>com.openclawup.local</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>icon</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
INFOPLISTEOF

  # Copy icon if available (only when running from local clone)
  local script_dir="${BASH_SOURCE[0]:-}"
  if [[ -n "$script_dir" ]]; then
    script_dir="$(cd "$(dirname "$script_dir")" && pwd)"
    if [[ -f "$script_dir/assets/icon.icns" ]]; then
      cp "$script_dir/assets/icon.icns" "$app_resources/icon.icns"
    fi
  fi

  success "App installed at /Applications/OpenClawUP Local.app"
}

# ── 8. Start services ──────────────────────────────────────

start_services() {
  mkdir -p "$OPENCLAW_DIR/logs"

  # Load services
  launchctl load "$LAUNCH_AGENTS_DIR/com.openclawup.manager.plist" 2>/dev/null || true
  launchctl load "$LAUNCH_AGENTS_DIR/com.openclawup.openclaw.plist" 2>/dev/null || true

  # Wait a moment for services to start
  sleep 2
  success "Services started"
}

# ── 9. Complete ─────────────────────────────────────────────

complete() {
  echo ""
  echo -e "${GREEN}${BOLD}  ✅ Installation complete!${RESET}"
  echo ""
  echo -e "  ${BOLD}What's next:${RESET}"
  echo ""

  case "$(get_channel_id "$SELECTED_CHANNEL")" in
    telegram)
      echo -e "  ${CYAN}→${RESET} Open Telegram and message your bot"
      ;;
    discord)
      echo -e "  ${CYAN}→${RESET} Invite your bot to a Discord server and @mention it"
      ;;
    whatsapp)
      echo -e "  ${CYAN}→${RESET} Open the management page to scan the QR code"
      ;;
    *)
      echo -e "  ${CYAN}→${RESET} Your $SELECTED_CHANNEL bot is now running"
      ;;
  esac

  echo -e "  ${CYAN}→${RESET} Manage: open ${BOLD}OpenClawUP Local${RESET} from Launchpad"
  echo -e "  ${CYAN}→${RESET} Or visit: ${BOLD}http://localhost:${MANAGER_PORT}${RESET}"
  echo ""
  echo -e "  ${DIM}OpenClaw runs in the background and starts automatically on login.${RESET}"
  echo -e "  ${DIM}To uninstall: curl -fsSL https://openclawup.com/uninstall.sh | bash${RESET}"
  echo ""

  # Open manager page
  sleep 1
  open "http://localhost:${MANAGER_PORT}" 2>/dev/null || true
}

# ── Main ────────────────────────────────────────────────────

main() {
  banner

  step "1/6" "Checking environment"
  check_os
  if ! check_node; then
    install_node
  fi

  step "2/6" "Installing OpenClaw"
  if ! check_openclaw; then
    install_openclaw
  else
    info "Already installed, skipping"
  fi

  step "3/6" "Channel setup"
  select_channel
  get_bot_token

  step "4/6" "AI model configuration"
  select_ai

  step "5/6" "Configuring & installing"
  generate_config
  install_manager
  register_services
  create_app

  step "6/6" "Starting services"
  start_services

  complete
}

main "$@"
