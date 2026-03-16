# OpenClawUP Local

One-click install [OpenClaw](https://github.com/openclaw/openclaw) AI assistant on your computer.

> Want 24/7 uptime without keeping your computer on?
> Try [OpenClawUP Cloud](https://openclawup.com) — deploy in 60 seconds, no technical setup needed. Free 3-day trial included.

## Install

### Option 1: Terminal (copy & paste)

macOS / Linux:

```bash
curl -fsSL https://openclawup.com/get | bash
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://openclawup.com/get.ps1 | iex"
```

### Option 2: Download & double-click

macOS: download [`install.command`](https://github.com/OpenClawUP/local/releases/latest/download/install.command), then double-click to run.

Windows: download [`install.bat`](https://github.com/OpenClawUP/local/releases/latest/download/install.bat), then double-click to run.

## What it does

The installer will:

1. **Pre-flight checks** — Verifies network connectivity, checks port availability (18789/18790/8080), auto-installs missing tools (tar, xz, npm) on Linux
2. **Check & install dependencies** — Node.js 22+ (auto-detected, installed if missing via Homebrew/apt/dnf/binary)
3. **Install OpenClaw** — Latest version via npm (auto-retries once on failure)
4. **Configure your channel** — Telegram, Discord, WhatsApp, Slack, Signal, and 15+ more
5. **Set up AI** — Bring your own OpenAI-compatible API key, or use OpenClawUP AI proxy (pay-as-you-go, auto-routing)
6. **Create a default Skill** — Your bot starts with a helpful assistant persona, customizable from the management page
7. **Start as background service** — Runs automatically on sign-in, survives terminal close
8. **Install management app** — Open `http://localhost:8080` or use the platform shortcut to manage everything

## Skills

Your bot's personality and behavior are defined by a **Skill** — a `SOUL.md` file in the OpenClaw workspace. The Skill Builder in the management page lets you:

- **Generate with AI** — Describe what you want your bot to do, and AI generates the perfect persona
- **Use a preset** — One-click presets for common use cases (Writing Assistant, Code Helper, Customer Support, Study Buddy, Translator)
- **Edit manually** — Full control over the `SOUL.md` content

Changes take effect on the next message — no restart needed.

## Security

The management console is protected by a token-based authentication system. During installation, a unique access token is generated and displayed in the terminal:

```
🔑 Manager access token: a1b2c3d4e5f6...
   Save this token — you'll need it to access http://localhost:8080
```

When you first open the management page, you'll be asked to enter this token. The token is stored in your browser's local storage for convenience.

The token file is stored at `~/.openclawup-local/auth-token`. Read-only endpoints (`GET /api/status` and `GET /api/logs`) are accessible without a token for monitoring purposes. All mutation endpoints require authentication.

If you lose your token, you can read it directly:

```bash
cat ~/.openclawup-local/auth-token
```

## Management

After installation, manage your bot through the web interface:

- Open the local shortcut created during install, or
- Visit `http://localhost:8080`

From the management page you can:

- Customize your bot's Skill (personality and behavior)
- Start / Stop / Restart the bot
- Add or remove chat channels
- Switch AI models
- Toggle auto-start on login
- Check for and install updates
- Top up OpenClawUP credits when using the proxy

The manager reads available models from your current config, so BYOK setups only show the models you actually configured.

## Channels

Guided setup works best with Telegram, Discord, Slack, WhatsApp, and Signal.

You can also enable additional channels from the local manager, including IRC, Matrix, Mattermost, Microsoft Teams, Google Chat, LINE, Feishu, Twitch, Nostr, BlueBubbles, Synology Chat, Nextcloud Talk, Tlon, Zalo, and WebChat.

## AI Models

**Bring your own key**: Use any OpenAI-compatible API key and endpoint. You have full control over which models and providers to use.

**OpenClawUP AI proxy**: All major AI models available — Claude, GPT, Gemini, DeepSeek, Qwen, and more. Smart auto-routing picks the best model for each task by default. Pay-as-you-go, no upfront commitment.

## Updates

The management page checks for updates automatically on each page load. When a new version is available, a notification bar appears at the top of the page with an "Update Now" button.

Clicking "Update Now" will:

1. Update OpenClaw to the latest version (`npm install -g openclaw@latest`)
2. Download the latest manager files from GitHub (server.mjs + public/index.html)
3. Prompt you to restart the manager service if needed (the page will auto-reload)

To update manually from the terminal:

```bash
# Update OpenClaw
npm install -g openclaw@latest

# Update manager files
curl -fsSL "https://raw.githubusercontent.com/openclawup/local/main/manager/server.mjs" -o ~/.openclawup-local/server.mjs
curl -fsSL "https://raw.githubusercontent.com/openclawup/local/main/manager/public/index.html" -o ~/.openclawup-local/public/index.html

# Restart manager (macOS)
launchctl stop com.openclawup.manager && launchctl start com.openclawup.manager

# Restart manager (Linux)
systemctl --user restart openclawup-manager.service
```

The update check caches the GitHub API response for 1 hour to avoid rate limits.

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

## Requirements

- macOS 12+ (Intel or Apple Silicon)
- Linux with systemd (Ubuntu 20.04+, Debian 11+, Fedora 36+, etc.)
- Windows 10/11 with PowerShell 5.1+
- Internet connection

## How it compares to OpenClawUP Cloud

| | Local (this) | [Cloud](https://openclawup.com) |
|---|---|---|
| Price | Free (AI pay-as-you-go) | ~~$49~~ $39/mo launch special (incl. $15 AI credits) |
| Free trial | N/A | 3 days + $3 AI credits |
| Uptime | While your computer is on | 24/7 |
| Setup | 2 minutes | 60 seconds |
| Channels | All supported | All supported |
| AI Models | All major models | All major models |
| Skills | AI-generated + presets | AI-generated + presets |
| Document search | — | Built-in QMD engine |
| Management | Local web UI | Cloud dashboard |
| Updates | One-click from manager | Automatic |

## License

MIT
