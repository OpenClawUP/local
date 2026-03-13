#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'
MANAGER_DIR="$HOME/.openclawup-local"
NPM_FALLBACK_PREFIX="$MANAGER_DIR/npm-global"

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

add_candidate_prefix() {
  local prefix="$1"
  [[ -n "$prefix" ]] || return 0

  for existing in "${OPENCLAW_PREFIX_CANDIDATES[@]:-}"; do
    if [[ "$existing" == "$prefix" ]]; then
      return 0
    fi
  done

  OPENCLAW_PREFIX_CANDIDATES+=("$prefix")
}

detect_openclaw_prefix() {
  local openclaw_path=""
  openclaw_path=$(command -v openclaw 2>/dev/null || true)
  [[ -n "$openclaw_path" ]] || return 0
  dirname "$(dirname "$openclaw_path")"
}

uninstall_openclaw_from_prefix() {
  local prefix="$1"
  [[ -n "$prefix" ]] || return 1

  local openclaw_bin="$prefix/bin/openclaw"
  local openclaw_pkg="$prefix/lib/node_modules/openclaw"
  if [[ ! -e "$openclaw_bin" && ! -d "$openclaw_pkg" ]]; then
    return 1
  fi

  echo -e "  Removing OpenClaw from $prefix..."
  if NPM_CONFIG_PREFIX="$prefix" npm uninstall -g openclaw; then
    return 0
  fi

  return 2
}

remove_manager_dir() {
  local preserve_fallback_prefix="$1"

  if [[ ! -d "$MANAGER_DIR" ]]; then
    echo -e "  ${GREEN}✓${RESET} Management console removed"
    return
  fi

  if [[ "$preserve_fallback_prefix" == "1" && -d "$NPM_FALLBACK_PREFIX" ]]; then
    shopt -s dotglob nullglob
    for path in "$MANAGER_DIR"/*; do
      if [[ "$path" == "$NPM_FALLBACK_PREFIX" ]]; then
        continue
      fi
      rm -rf "$path"
    done
    shopt -u dotglob nullglob
    echo -e "  ${GREEN}✓${RESET} Management console removed"
    echo -e "  ${DIM}  Kept $NPM_FALLBACK_PREFIX for OpenClaw CLI${RESET}"
    return
  fi

  rm -rf "$MANAGER_DIR"
  echo -e "  ${GREEN}✓${RESET} Management console removed"
}

echo ""
echo -e "${BOLD}OpenClawUP Local — Uninstaller${RESET}"
echo ""

read -rp "  This will remove OpenClawUP Local and all its data. Continue? (y/N): " confirm < /dev/tty
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Cancelled."
  exit 0
fi

echo ""

# Stop and unload services
echo -e "  Stopping services..."
if [[ "$(uname)" == "Darwin" ]]; then
  launchctl unload "$HOME/Library/LaunchAgents/com.openclawup.openclaw.plist" 2>/dev/null || true
  launchctl unload "$HOME/Library/LaunchAgents/com.openclawup.manager.plist" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.openclawup.openclaw.plist"
  rm -f "$HOME/Library/LaunchAgents/com.openclawup.manager.plist"
else
  systemctl --user stop openclawup-openclaw.service 2>/dev/null || true
  systemctl --user stop openclawup-manager.service 2>/dev/null || true
  systemctl --user disable openclawup-openclaw.service 2>/dev/null || true
  systemctl --user disable openclawup-manager.service 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/openclawup-openclaw.service"
  rm -f "$HOME/.config/systemd/user/openclawup-manager.service"
  systemctl --user daemon-reload 2>/dev/null || true
fi
echo -e "  ${GREEN}✓${RESET} Services stopped and removed"

# Remove app/desktop entry
if [[ "$(uname)" == "Darwin" ]]; then
  rm -rf "/Applications/OpenClawUP Local.app"
  echo -e "  ${GREEN}✓${RESET} App removed from Applications"
else
  rm -f "$HOME/.local/share/applications/openclawup-local.desktop"
  echo -e "  ${GREEN}✓${RESET} Desktop entry removed"
fi

# Ask about OpenClaw data
echo ""
read -rp "  Also remove OpenClaw config and data (~/.openclaw)? (y/N): " remove_data < /dev/tty
if [[ "$remove_data" == "y" || "$remove_data" == "Y" ]]; then
  rm -rf "$HOME/.openclaw"
  echo -e "  ${GREEN}✓${RESET} OpenClaw data removed"
else
  echo -e "  ${DIM}  Kept ~/.openclaw (config and data preserved)${RESET}"
fi

# Ask about OpenClaw itself
echo ""
read -rp "  Also uninstall OpenClaw globally? (y/N): " remove_openclaw < /dev/tty
if [[ "$remove_openclaw" == "y" || "$remove_openclaw" == "Y" ]]; then
  OPENCLAW_PREFIX_CANDIDATES=()
  add_candidate_prefix "$(current_npm_prefix)"
  add_candidate_prefix "$(detect_openclaw_prefix)"
  add_candidate_prefix "$NPM_FALLBACK_PREFIX"

  removed_any=0
  failed_any=0
  for prefix in "${OPENCLAW_PREFIX_CANDIDATES[@]}"; do
    if uninstall_openclaw_from_prefix "$prefix"; then
      removed_any=1
    else
      status=$?
      if [[ "$status" -eq 2 ]]; then
        failed_any=1
      fi
    fi
  done

  if [[ "$removed_any" -eq 1 ]]; then
    echo -e "  ${GREEN}✓${RESET} OpenClaw uninstalled"
  elif [[ "$failed_any" -eq 1 ]]; then
    echo -e "  ${YELLOW}⚠${RESET} OpenClaw uninstall encountered an error. Please rerun with the npm output above."
  else
    echo -e "  ${DIM}  OpenClaw was not found in known global npm prefixes${RESET}"
  fi
else
  echo -e "  ${DIM}  Kept OpenClaw (still available via command line)${RESET}"
fi

echo ""
if [[ "$remove_openclaw" == "y" || "$remove_openclaw" == "Y" ]]; then
  remove_manager_dir 0
else
  remove_manager_dir 1
fi

echo ""
echo -e "  ${GREEN}${BOLD}✅ OpenClawUP Local has been uninstalled.${RESET}"
echo ""
