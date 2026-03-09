#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}OpenClawUP Local — Uninstaller${RESET}"
echo ""

read -rp "  This will remove OpenClawUP Local and all its data. Continue? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Cancelled."
  exit 0
fi

echo ""

# Stop and unload services
echo -e "  Stopping services..."
launchctl unload "$HOME/Library/LaunchAgents/com.openclawup.openclaw.plist" 2>/dev/null || true
launchctl unload "$HOME/Library/LaunchAgents/com.openclawup.manager.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.openclawup.openclaw.plist"
rm -f "$HOME/Library/LaunchAgents/com.openclawup.manager.plist"
echo -e "  ${GREEN}✓${RESET} Services stopped and removed"

# Remove manager
rm -rf "$HOME/.openclawup-local"
echo -e "  ${GREEN}✓${RESET} Management console removed"

# Remove app
rm -rf "/Applications/OpenClawUP Local.app"
echo -e "  ${GREEN}✓${RESET} App removed from Applications"

# Ask about OpenClaw data
echo ""
read -rp "  Also remove OpenClaw config and data (~/.openclaw)? (y/N): " remove_data
if [[ "$remove_data" == "y" || "$remove_data" == "Y" ]]; then
  rm -rf "$HOME/.openclaw"
  echo -e "  ${GREEN}✓${RESET} OpenClaw data removed"
else
  echo -e "  ${DIM}  Kept ~/.openclaw (config and data preserved)${RESET}"
fi

# Ask about OpenClaw itself
echo ""
read -rp "  Also uninstall OpenClaw globally? (y/N): " remove_openclaw
if [[ "$remove_openclaw" == "y" || "$remove_openclaw" == "Y" ]]; then
  npm uninstall -g openclaw 2>/dev/null || true
  echo -e "  ${GREEN}✓${RESET} OpenClaw uninstalled"
else
  echo -e "  ${DIM}  Kept OpenClaw (still available via command line)${RESET}"
fi

echo ""
echo -e "  ${GREEN}${BOLD}✅ OpenClawUP Local has been uninstalled.${RESET}"
echo ""
