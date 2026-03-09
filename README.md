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
4. **Set up AI** — OpenClawUP AI proxy (pay-as-you-go, auto-routing) or your own OpenAI-compatible API key
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
- Top up OpenClawUP credits when using the proxy

The manager reads available models from your current config, so BYOK setups only show the models you actually configured.

## Channels

Guided setup works best with Telegram, Discord, Slack, WhatsApp, and Signal.

You can also enable additional channels from the local manager, including IRC, Matrix, Mattermost, Microsoft Teams, Google Chat, LINE, Feishu, Twitch, Nostr, BlueBubbles, Synology Chat, Nextcloud Talk, Tlon, Zalo, and WebChat.

## AI Models

With OpenClawUP AI proxy (recommended), the installer configures:

- **Auto Routing** (default) — Lets OpenClawUP pick the best model automatically
- **Gemini 3 Flash**
- **GPT-5.4**
- **Claude Sonnet 4.6**
- **DeepSeek V3.2**
- **Qwen 3.5**
- **GLM-5**
- **MiniMax M2.5**
- **Kimi K2.5**
- **Claude Opus 4.5**

Or bring your own OpenAI-compatible API key and use any model your provider exposes.

## Uninstall

```bash
curl -fsSL https://openclawup.com/uninstall.sh | bash
```

## Requirements

- macOS 12+ (Intel or Apple Silicon)
- Internet connection

Windows support is coming soon.

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
