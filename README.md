# OpenClawUP Local

One-click install [OpenClaw](https://github.com/openclaw/openclaw) AI assistant on your Mac.

> Want 24/7 uptime without keeping your computer on?
> Try [OpenClawUP Cloud](https://openclawup.com) — deploy in 60 seconds, no technical setup needed.

## Install

### Option 1: Terminal (copy & paste)

```bash
curl -fsSL https://openclawup.com/get | bash
```

### Option 2: Download & double-click

Download [`install.command`](https://github.com/OpenClawUP/local/releases/latest/download/install.command), then double-click to run.

## What it does

The installer will:

1. **Check & install dependencies** — Node.js 22+ (auto-detected, installed if missing)
2. **Install OpenClaw** — Latest version via npm
3. **Configure your channel** — Telegram, Discord, WhatsApp, Slack, Signal, and 15+ more
4. **Set up AI** — OpenClawUP AI proxy (pay-as-you-go, auto-routing) or bring your own API key
5. **Start as background service** — Runs automatically on login, survives terminal close
6. **Install management app** — Find "OpenClawUP Local" in Launchpad to manage everything

## Management

After installation, manage your bot through the web interface:

- Open **OpenClawUP Local** from Launchpad, or
- Visit `http://localhost:8080`

From the management page you can:

- Start / Stop / Restart the bot
- Add or remove chat channels
- Switch AI models
- Toggle auto-start on login
- Top up AI credits

## Supported Channels

Telegram · Discord · WhatsApp · Slack · Signal · IRC · Matrix · Mattermost · Microsoft Teams · Google Chat · LINE · Feishu · Twitch · Nostr · BlueBubbles · Synology Chat · Nextcloud Talk · Tlon · Zalo · WebChat

## AI Models

With OpenClawUP AI proxy (recommended):

- **Gemini 2.5 Flash** (default) — Best value
- **Claude Sonnet 4.5** — Best for complex reasoning
- **GPT-5** — Strong all-rounder
- **DeepSeek V3** — Great for code
- **GLM-4.7** / **MiniMax M2.5**

Auto-routing automatically selects the best model for each conversation.

Or bring your own API key from OpenAI, Anthropic, Google, or any OpenAI-compatible provider.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/OpenClawUP/local/main/uninstall.sh | bash
```

## Requirements

- macOS 12+ (Intel or Apple Silicon)
- Internet connection

## How it compares to OpenClawUP Cloud

| | Local (this) | [Cloud](https://openclawup.com) |
|---|---|---|
| Price | Free (AI pay-as-you-go) | $49/month (incl. $15 AI credits) |
| Uptime | While your Mac is on | 24/7 |
| Setup | 2 minutes | 60 seconds |
| Channels | All supported | All supported |
| AI Models | All supported | All supported |
| Management | Local web UI | Cloud dashboard |
| Updates | Manual | Automatic |

## License

MIT
