# OpenClawUP Local

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)]()

**One-click install [OpenClaw](https://github.com/openclaw/openclaw) AI assistant on your computer.** Your own AI chatbot on Telegram, Discord, WhatsApp, Slack, and 15+ channels — running locally, completely under your control.

> Want 24/7 uptime without keeping your computer on?
> Try [OpenClawUP Cloud](https://openclawup.com) — deploy in 60 seconds, no technical setup needed. Free trial included.

---

## Features

- **2-minute setup** — one command, fully guided, no technical knowledge needed
- **20+ chat channels** — Telegram, Discord, WhatsApp, Slack, Signal, and more
- **All major AI models** — Claude, GPT, Gemini, DeepSeek, Qwen, or bring your own API key
- **Skill Builder** — AI-generated bot personality, presets, or manual editing
- **Web management UI** — start/stop, switch models, add channels, update — all from `localhost:8080`
- **Auto-start on login** — runs as a background service, survives terminal close
- **One-click updates** — OpenClaw + manager updated from the web UI

---

## Quick Start

### macOS / Linux

```bash
curl -fsSL https://openclawup.com/get | bash
```

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://openclawup.com/get.ps1 | iex"
```

### Download & double-click

| Platform | Download |
|----------|----------|
| macOS | [`install.command`](https://github.com/OpenClawUP/local/releases/latest/download/install.command) |
| Windows | [`install.bat`](https://github.com/OpenClawUP/local/releases/latest/download/install.bat) |

---

## What the installer does

1. **Pre-flight checks** — network, ports (18789/18790/8080), missing tools
2. **Install Node.js 22+** — auto-detected, installed via Homebrew/apt/dnf/binary if missing
3. **Install OpenClaw** — latest version via npm, auto-retries on failure
4. **Configure channel** — guided setup for Telegram, Discord, WhatsApp, Slack, Signal
5. **Set up AI** — bring your own API key, or use OpenClawUP proxy (pay-as-you-go)
6. **Create default Skill** — starts with a helpful assistant persona
7. **Start background service** — runs on login, survives terminal close
8. **Launch management UI** — `http://localhost:8080` ready to use

---

## Skills

Your bot's personality is defined by a **Skill** — a `SOUL.md` file in the workspace. The management UI offers three ways to set it:

| Method | How |
|--------|-----|
| **AI-generated** | Describe what you want, AI writes the persona |
| **Presets** | One-click: Writing Assistant, Code Helper, Customer Support, Study Buddy, Translator |
| **Manual** | Edit `SOUL.md` directly — full control |

Changes take effect on the next message — no restart needed.

---

## Channels

**Guided setup**: Telegram, Discord, Slack, WhatsApp, Signal

**Add from manager UI**: IRC, Matrix, Mattermost, Microsoft Teams, Google Chat, LINE, Feishu, Twitch, Nostr, BlueBubbles, Synology Chat, Nextcloud Talk, Tlon, Zalo, WebChat

---

## AI Models

| Mode | Description |
|------|-------------|
| **Bring your own key** | Any OpenAI-compatible API. Full control over models and providers. |
| **OpenClawUP proxy** | Claude, GPT, Gemini, DeepSeek, Qwen, and more. Auto-routing picks the best model per task. Pay-as-you-go. |

---

## Management

After installation, open `http://localhost:8080` (or the shortcut created during install).

From the management page you can:
- Customize your bot's Skill
- Start / Stop / Restart the bot
- Add or remove chat channels
- Switch AI models
- Toggle auto-start on login
- Check for and install updates
- Top up credits (when using OpenClawUP proxy)

---

## Security

The management console is protected by token-based authentication. During installation, a unique access token is generated:

```
Manager access token: a1b2c3d4e5f6...
Save this token — you'll need it to access http://localhost:8080
```

- All mutation endpoints require the token (via `Authorization: Bearer` header or `?token=` param)
- Read-only endpoints (`GET /api/status`, `GET /api/logs`) are open for monitoring
- `.env` and token files are protected with `chmod 600` (owner-only read/write)
- Config files are backed up before every write (`openclaw.json.bak`)

Lost your token?

```bash
cat ~/.openclawup-local/auth-token
```

---

## Updates

The manager checks for updates automatically. When available, a notification bar appears with an **Update Now** button.

Update manually from terminal:

```bash
# Update OpenClaw
npm install -g openclaw@latest

# Update manager
curl -fsSL "https://raw.githubusercontent.com/openclawup/local/main/manager/server.mjs" -o ~/.openclawup-local/server.mjs
curl -fsSL "https://raw.githubusercontent.com/openclawup/local/main/manager/public/index.html" -o ~/.openclawup-local/public/index.html

# Restart manager
# macOS:
launchctl stop com.openclawup.manager && launchctl start com.openclawup.manager
# Linux:
systemctl --user restart openclawup-manager.service
```

---

## Uninstall

macOS / Linux:

```bash
curl -fsSL https://openclawup.com/unget | bash
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://openclawup.com/uninstall.ps1 | iex"
```

Windows download: [`uninstall.bat`](https://github.com/OpenClawUP/local/releases/latest/download/uninstall.bat)

---

## Troubleshooting

**Port 8080 is already in use**
```bash
# Find what's using it
lsof -i :8080
# Or change the port
PORT=9090 node ~/.openclawup-local/server.mjs
```

**Bot not responding after install**
```bash
# Check status
curl -s http://localhost:8080/api/status | jq .

# Check logs
curl -s http://localhost:8080/api/logs | jq '.gateway.content' -r | tail -20
```

**Node.js version too old**
```bash
node --version  # Need 22+
# macOS: brew install node@22
# Linux: see https://nodejs.org/en/download
```

**Service not starting on login (Linux)**
```bash
# Ensure user lingering is enabled
loginctl enable-linger $USER
systemctl --user status openclawup-openclaw.service
```

**Lost management token**
```bash
cat ~/.openclawup-local/auth-token
```

---

## Requirements

| Platform | Version |
|----------|---------|
| macOS | 12+ (Intel or Apple Silicon) |
| Linux | systemd-based (Ubuntu 20.04+, Debian 11+, Fedora 36+) |
| Windows | 10/11 with PowerShell 5.1+ |

Internet connection required for installation and AI model access.

---

## Local vs Cloud

| | Local (this) | [Cloud](https://openclawup.com) |
|---|---|---|
| **Price** | Free (AI pay-as-you-go) | $39/mo (incl. $10 AI credits) |
| **Free trial** | N/A | 7 days + $5 AI credits |
| **Uptime** | While computer is on | 24/7 |
| **Setup time** | ~2 minutes | ~60 seconds |
| **Channels** | All 20+ supported | All 20+ supported |
| **AI Models** | All major models | All major models |
| **Skills** | AI-generated + presets | AI-generated + presets |
| **Doc search** | — | Built-in QMD engine |
| **Management** | Local web UI | Cloud dashboard |
| **Updates** | One-click from manager | Automatic |
| **Self-healing** | — | Watchdog + auto-repair |
| **Terminal** | — | Browser-based terminal |
| **Config backup** | — | Hourly git snapshots |

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-improvement`)
3. Test on your platform (macOS, Linux, or Windows)
4. Submit a pull request

For bugs or feature requests, [open an issue](https://github.com/OpenClawUP/local/issues).

---

## License

[MIT](LICENSE)
