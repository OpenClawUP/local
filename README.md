# OpenClawUP Local

One-click install [OpenClaw](https://github.com/openclaw/openclaw) AI assistant on your computer.

> Want 24/7 uptime without keeping your computer on?
> Try [OpenClawUP Cloud](https://openclawup.com) — deploy in 60 seconds, no technical setup needed. Free 3-day trial included.

## Install

### Option 1: Terminal (copy & paste)

macOS:

```bash
curl -fsSL https://openclawup.com/get | bash
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/OpenClawUP/local/main/install.ps1 | iex"
```

### Option 2: Download & double-click

macOS: download [`install.command`](https://github.com/OpenClawUP/local/releases/latest/download/install.command), then double-click to run.

Windows: download [`install.bat`](https://github.com/OpenClawUP/local/releases/latest/download/install.bat), then double-click to run.

## What it does

The installer will:

1. **Check & install dependencies** — Node.js 22+ (auto-detected, installed if missing)
2. **Install OpenClaw** — Latest version via npm
3. **Configure your channel** — Telegram, Discord, WhatsApp, Slack, Signal, and 15+ more
4. **Set up AI** — Bring your own OpenAI-compatible API key, or use OpenClawUP AI proxy (pay-as-you-go, auto-routing)
5. **Start as background service** — Runs automatically on sign-in, survives terminal close
6. **Install management app** — Open `http://localhost:8080` or use the platform shortcut to manage everything

## Management

After installation, manage your bot through the web interface:

- Open the local shortcut created during install, or
- Visit `http://localhost:8080`

From the management page you can:

- Start / Stop / Restart the bot
- Add or remove chat channels
- Switch AI models
- Toggle auto-start on login
- Top up OpenClawUP credits when using the proxy

The manager reads available models from your current config, so BYOK setups only show the models you actually configured.

## Channels

Guided setup works best with Telegram, Discord, Slack, WhatsApp, and Signal.

You can also enable additional channels from the local manager, including IRC, Matrix, Mattermost, Microsoft Teams, Google Chat, LINE, Feishu, Twitch, Nostr, BlueBubbles, Synology Chat, Nextcloud Talk, Tlon, Zalo, and WebChat.

## AI Models

**Bring your own key**: Use any OpenAI-compatible API key and endpoint. You have full control over which models and providers to use.

**OpenClawUP AI proxy**: All major AI models available — Claude, GPT, Gemini, DeepSeek, Qwen, and more. Smart auto-routing picks the best model for each task by default. Pay-as-you-go, no upfront commitment.

## Uninstall

macOS:

```bash
curl -fsSL https://openclawup.com/uninstall.sh | bash
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://openclawup.com/uninstall.ps1 | iex"
```

Windows download: [`uninstall.bat`](https://github.com/OpenClawUP/local/releases/latest/download/uninstall.bat)

## Requirements

- macOS 12+ (Intel or Apple Silicon)
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
| Document search | — | Built-in QMD engine |
| Management | Local web UI | Cloud dashboard |
| Updates | Manual | Automatic |

## License

MIT
