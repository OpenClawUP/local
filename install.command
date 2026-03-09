#!/bin/bash
# OpenClawUP Local — Double-click to install
# https://openclawup.com/install

cd "$(dirname "$0")"
bash install.sh
echo ""
echo "You can close this window now."
read -rp "Press Enter to exit..."
