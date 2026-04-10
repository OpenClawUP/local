import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, mkdirSync, rmSync, chmodSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const MANAGER_VERSION = "1.0.0";
const PORT = process.env.PORT || 8080;
const HOME_DIR = process.env.USERPROFILE || process.env.HOME;
const IS_WINDOWS = process.platform === "win32";
const WINDOWS_TASKS = {
  openclaw: "OpenClawUP-OpenClaw",
  manager: "OpenClawUP-Manager",
};
const OPENCLAW_DIR = process.env.OPENCLAW_DIR || join(HOME_DIR, ".openclaw");
const CONFIG_PATH = join(OPENCLAW_DIR, "openclaw.json");
const ENV_PATH = join(OPENCLAW_DIR, ".env");
const PUBLIC_DIR = join(import.meta.dirname, "public");
const MANAGER_DIR = process.env.OPENCLAWUP_MANAGER_DIR || process.cwd();
const OPENCLAW_PLIST_PATH = join(HOME_DIR, "Library/LaunchAgents/com.openclawup.openclaw.plist");
const MANAGER_PLIST_PATH = join(HOME_DIR, "Library/LaunchAgents/com.openclawup.manager.plist");
const OPENCLAW_AUTOSTART_REF = IS_WINDOWS ? `Task Scheduler/${WINDOWS_TASKS.openclaw}` : OPENCLAW_PLIST_PATH;
const MANAGER_AUTOSTART_REF = IS_WINDOWS ? `Task Scheduler/${WINDOWS_TASKS.manager}` : MANAGER_PLIST_PATH;
const CHANNEL_META_PATH = join(MANAGER_DIR, "channel-meta.json");
const SKILL_META_PATH = join(MANAGER_DIR, "skill-meta.json");
const AUTH_TOKEN_PATH = join(MANAGER_DIR, "auth-token");
const LOG_SOURCES = {
  gateway: join(OPENCLAW_DIR, "logs", "gateway.log"),
  gatewayError: join(OPENCLAW_DIR, "logs", "gateway.err"),
  manager: join(MANAGER_DIR, "manager.log"),
  managerError: join(MANAGER_DIR, "manager.err"),
};

// ── Validation ─────────────────────────────────────────────
const VALID_CHANNEL_IDS = new Set([
  "telegram", "discord", "slack", "whatsapp", "signal",
  "googlechat", "teams", "matrix", "feishu", "line",
  "mattermost", "irc", "nostr", "webchat", "zalo",
]);
const MAX_MODEL_ID_LEN = 128;
const MAX_TOKEN_LEN = 512;
const MAX_BODY_BYTES = 64 * 1024; // 64 KB

function isValidModelId(id) {
  if (!id || typeof id !== "string") return false;
  if (id.length > MAX_MODEL_ID_LEN) return false;
  return /^[a-zA-Z0-9._\-/:]+$/.test(id);
}

function isValidChannelId(id) {
  return typeof id === "string" && VALID_CHANNEL_IDS.has(id);
}

// ── Auth ────────────────────────────────────────────────────

function getOrCreateAuthToken() {
  try {
    if (existsSync(AUTH_TOKEN_PATH)) {
      const token = readFileSync(AUTH_TOKEN_PATH, "utf-8").trim();
      if (token.length > 0) return token;
    }
  } catch {}
  const token = randomBytes(16).toString("hex");
  writeFileSync(AUTH_TOKEN_PATH, token, "utf-8");
  try { chmodSync(AUTH_TOKEN_PATH, 0o600); } catch {}
  return token;
}

function checkAuth(req) {
  let expected;
  try {
    if (!existsSync(AUTH_TOKEN_PATH)) return true; // No token file yet — open access
    expected = readFileSync(AUTH_TOKEN_PATH, "utf-8").trim();
    if (!expected) return true;
  } catch {
    return true;
  }

  // Check Authorization: Bearer <token> header
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    const headerToken = authHeader.slice(7).trim();
    if (headerToken === expected) return true;
  }

  // Check ?token=xxx query param (for browser access)
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const queryToken = url.searchParams.get("token");
  if (queryToken && queryToken === expected) return true;

  return false;
}

// ── Update cache ────────────────────────────────────────────

let _updateCache = null;
let _updateCacheTime = 0;
const UPDATE_CACHE_TTL = 3600000; // 1 hour

// ── Helpers ─────────────────────────────────────────────────

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function readConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    // Strip JSON5 full-line comments only (avoids destroying URLs like https://...)
    const cleaned = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function writeConfig(config) {
  // Backup current config before overwriting
  try {
    if (existsSync(CONFIG_PATH)) {
      copyFileSync(CONFIG_PATH, CONFIG_PATH + ".bak");
    }
  } catch {}
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function readEnv() {
  try {
    const raw = readFileSync(ENV_PATH, "utf-8");
    const env = {};
    for (const line of raw.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
    return env;
  } catch {
    return {};
  }
}

function writeEnv(env) {
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(ENV_PATH, content + "\n", "utf-8");
  try { chmodSync(ENV_PATH, 0o600); } catch {}
}

function maskValue(value) {
  if (typeof value !== "string" || value.length === 0) return "****";
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "****";
}

function readLogTail(filePath, maxLines = 120) {
  if (!existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      updatedAt: null,
      content: "",
      lineCount: 0,
    };
  }

  let raw = "";
  const MAX_LOG_BYTES = 512 * 1024; // 512 KB safety limit

  try {
    raw = execFileSync("tail", ["-n", String(maxLines), filePath], {
      encoding: "utf-8",
      maxBuffer: MAX_LOG_BYTES,
    });
  } catch {
    // Fallback: read only the last MAX_LOG_BYTES of the file
    const stat = statSync(filePath);
    if (stat.size > MAX_LOG_BYTES) {
      const fd = require("node:fs").openSync(filePath, "r");
      const buf = Buffer.alloc(MAX_LOG_BYTES);
      require("node:fs").readSync(fd, buf, 0, MAX_LOG_BYTES, stat.size - MAX_LOG_BYTES);
      require("node:fs").closeSync(fd);
      raw = buf.toString("utf-8");
    } else {
      raw = readFileSync(filePath, "utf-8");
    }
  }

  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();

  return {
    path: filePath,
    exists: true,
    updatedAt: new Date(statSync(filePath).mtimeMs).toISOString(),
    content: lines.join("\n"),
    lineCount: lines.length,
  };
}

function listEnvKeys(env) {
  return Object.keys(env)
    .filter((key) => !key.startsWith("#"))
    .sort();
}

function runPowerShell(script) {
  return execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf-8" },
  );
}

function parseJsonOutput(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getLaunchctlStatus(label) {
  try {
    const output = execSync(`launchctl list ${label} 2>/dev/null`, {
      encoding: "utf-8",
    });
    return {
      loaded: true,
      details: output.trim() || "loaded",
    };
  } catch {
    return {
      loaded: false,
      details: "not loaded",
    };
  }
}

function getWindowsTaskInfo(taskName) {
  if (!IS_WINDOWS) return null;

  // Sanitize task name to prevent PowerShell injection
  const safeName = taskName.replace(/['"\\`$]/g, "");
  try {
    const script = `
      $task = Get-ScheduledTask -TaskName '${safeName}' -ErrorAction SilentlyContinue
      if ($null -eq $task) {
        @{ exists = $false; enabled = $false; state = 'missing'; lastRunTime = $null; lastTaskResult = $null } | ConvertTo-Json -Compress
        exit
      }
      $info = Get-ScheduledTaskInfo -TaskName '${safeName}' -ErrorAction SilentlyContinue
      @{
        exists = $true
        enabled = [bool]$task.Settings.Enabled
        state = [string]$task.State
        lastRunTime = if ($info -and $info.LastRunTime -gt [datetime]::MinValue) { $info.LastRunTime.ToString('o') } else { $null }
        lastTaskResult = if ($info) { [int]$info.LastTaskResult } else { $null }
      } | ConvertTo-Json -Compress
    `;

    return parseJsonOutput(runPowerShell(script).trim(), {
      exists: false,
      enabled: false,
      state: "unknown",
      lastRunTime: null,
      lastTaskResult: null,
    });
  } catch {
    return {
      exists: false,
      enabled: false,
      state: "unknown",
      lastRunTime: null,
      lastTaskResult: null,
    };
  }
}

function getServiceStatus(service) {
  if (IS_WINDOWS) {
    const info = getWindowsTaskInfo(WINDOWS_TASKS[service]);
    return {
      loaded: Boolean(info?.exists && info?.enabled),
      details: info?.exists
        ? `${info.state}${info.enabled ? "" : " (disabled)"}`
        : "not registered",
    };
  }

  return getLaunchctlStatus(
    service === "openclaw" ? "com.openclawup.openclaw" : "com.openclawup.manager",
  );
}

function isOpenClawRunning() {
  if (IS_WINDOWS) {
    const info = getWindowsTaskInfo(WINDOWS_TASKS.openclaw);
    return info?.state === "Running";
  }

  try {
    const result = execSync("launchctl list com.openclawup.openclaw 2>/dev/null", { encoding: "utf-8" });
    return !result.includes('"LastExitStatus" = -1');
  } catch {
    return false;
  }
}

function getOpenClawVersion() {
  try {
    return execSync("openclaw --version 2>/dev/null", { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    return "unknown";
  }
}

function getUptime() {
  if (IS_WINDOWS) {
    const info = getWindowsTaskInfo(WINDOWS_TASKS.openclaw);
    if (!info?.lastRunTime) return null;
    const startedAt = Date.parse(info.lastRunTime);
    return Number.isFinite(startedAt) ? Date.now() - startedAt : null;
  }

  try {
    if (!existsSync(OPENCLAW_PLIST_PATH)) return null;
    const stat = statSync(OPENCLAW_PLIST_PATH);
    return Date.now() - stat.mtimeMs;
  } catch {
    return null;
  }
}

function formatUptime(ms) {
  if (!ms) return "unknown";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getChannelEnvKey(channelId) {
  return `${String(channelId)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")}_BOT_TOKEN`;
}

async function fetchBotName(channelId, token) {
  if (!token) return null;
  try {
    if (channelId === "telegram") {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      if (data.ok && data.result) {
        return data.result.username ? `@${data.result.username}` : data.result.first_name;
      }
    } else if (channelId === "discord") {
      const res = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${token}` },
      });
      const data = await res.json();
      if (data.username) return data.username;
    } else if (channelId === "slack") {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.user) return data.user;
    }
  } catch {
    // Non-fatal: bot name is optional
  }
  return null;
}

function resolveEnvRefs(value) {
  if (typeof value !== "string") return value;
  const env = readEnv();
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => env[key.trim()] || "");
}

function readSkillMeta() {
  try {
    if (existsSync(SKILL_META_PATH)) {
      return JSON.parse(readFileSync(SKILL_META_PATH, "utf-8"));
    }
  } catch {}
  return null;
}

function writeSkillMeta(meta) {
  writeFileSync(SKILL_META_PATH, JSON.stringify(meta, null, 2));
}

function getFirstProvider(config) {
  const providers = config?.models?.providers ?? {};
  const entries = Object.entries(providers);
  if (entries.length === 0) return null;
  const [id, provider] = entries[0];
  const apiKey = resolveEnvRefs(provider.apiKey);
  const baseUrl = provider.baseUrl;
  const apiType = provider.api || "openai-completions";
  const models = provider.models || [];
  const model = models.find((m) => m.id !== "auto") || models[0];
  return { id, baseUrl, apiKey, apiType, modelId: model?.id };
}

async function callAi(prompt) {
  const config = readConfig();
  const provider = getFirstProvider(config);
  if (!provider) throw new Error("No AI provider configured");
  if (!provider.apiKey) throw new Error("No API key configured");

  const { baseUrl, apiKey, apiType, modelId } = provider;

  if (apiType === "anthropic-messages") {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.content?.[0]?.text?.trim() || null;
  }

  if (apiType === "google-generative-ai") {
    const res = await fetch(
      `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  // Default: openai-completions (works for OpenAI, OpenRouter, DeepSeek, Groq, Mistral, OpenClawUP proxy)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function readChannelMeta() {
  try {
    if (existsSync(CHANNEL_META_PATH)) {
      return JSON.parse(readFileSync(CHANNEL_META_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function writeChannelMeta(meta) {
  writeFileSync(CHANNEL_META_PATH, JSON.stringify(meta, null, 2));
}

function extractChannelInfo(config) {
  const channels = [];
  if (!config?.channels) return channels;
  const meta = readChannelMeta();
  for (const [id, ch] of Object.entries(config.channels)) {
    if (ch.enabled !== false) {
      channels.push({ id, botName: meta[id]?.botName || null });
    }
  }
  return channels;
}

function extractAvailableModels(config) {
  const items = [];
  const providers = config?.models?.providers ?? {};

  for (const [providerId, provider] of Object.entries(providers)) {
    const models = Array.isArray(provider?.models) ? provider.models : [];
    for (const model of models) {
      if (!model?.id) continue;
      items.push({
        id: `${providerId}/${model.id}`,
        name: model.name || model.id,
        tag: model.id === "auto" ? "default" : undefined,
      });
    }
  }

  return items;
}

// Model presets per provider — so users can pick from a list
const MODEL_PRESETS = {
  openai:     [{ id: "gpt-5", name: "GPT-5" }, { id: "gpt-4.1", name: "GPT-4.1" }, { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" }, { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" }, { id: "o3", name: "o3" }, { id: "o4-mini", name: "o4-mini" }],
  google:     [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }, { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }, { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" }],
  anthropic:  [{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" }, { id: "claude-opus-4-20250514", name: "Claude Opus 4" }, { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5" }],
  deepseek:   [{ id: "deepseek-chat", name: "DeepSeek V3" }, { id: "deepseek-reasoner", name: "DeepSeek R1" }],
  openrouter: [{ id: "google/gemini-2.5-flash-preview", name: "Gemini 2.5 Flash" }, { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" }, { id: "openai/gpt-5", name: "GPT-5" }, { id: "deepseek/deepseek-chat", name: "DeepSeek V3" }],
  groq:       [{ id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" }, { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" }],
  mistral:    [{ id: "mistral-large-latest", name: "Mistral Large" }, { id: "mistral-small-latest", name: "Mistral Small" }],
};

// Skills registry — curated ClawHub skills, fetched from platform API with embedded fallback
const SKILLS_API_URL = "https://openclawup.com/api/skills";
const SKILLS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let _skillsCache = null;
let _skillsCacheTime = 0;

// Embedded fallback (used when offline or API unreachable)
const FALLBACK_SKILLS = [
  { id: "JimLiuxinghai/find-skills", name: "Find Skills", essential: true, installCmd: "clawhub install JimLiuxinghai/find-skills", description: "Discover and install agent skills", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/jimliuxinghai/find-skills" },
  { id: "spclaudehome/skill-vetter", name: "Skill Vetter", essential: true, installCmd: "clawhub install spclaudehome/skill-vetter", description: "Security-first skill vetting", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/spclaudehome/skill-vetter" },
  { id: "pskoett/self-improving-agent", name: "Self-Improving Agent", essential: true, installCmd: "clawhub install pskoett/self-improving-agent", description: "Logs learnings for continuous improvement", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/pskoett/self-improving-agent" },
  { id: "steipete/brave-search", name: "Brave Search", essential: false, installCmd: "clawhub install steipete/brave-search", description: "Web search via Brave Search API", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/steipete/brave-search" },
  { id: "summarize", name: "Summarize", essential: false, installCmd: "clawhub install summarize", description: "Summarize URLs, PDFs, and files", githubUrl: "https://github.com/openclaw/openclaw/tree/main/skills/summarize" },
  { id: "bert-builder/tavily", name: "Tavily Search", essential: false, installCmd: "clawhub install bert-builder/tavily", description: "AI-optimized web search", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/bert-builder/tavily" },
  { id: "weather", name: "Weather", essential: false, installCmd: "clawhub install weather", description: "Current weather and forecasts", githubUrl: "https://github.com/openclaw/openclaw/tree/main/skills/weather" },
  { id: "abe238/youtube-summarizer", name: "YouTube Summarizer", essential: false, installCmd: "clawhub install abe238/youtube-summarizer", description: "YouTube transcripts and summaries", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/abe238/youtube-summarizer" },
  { id: "brandonwise/ai-humanizer", name: "Humanize AI Text", essential: false, installCmd: "clawhub install brandonwise/ai-humanizer", description: "Make AI text sound natural", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/brandonwise/ai-humanizer" },
  { id: "TheSethRose/agent-browser", name: "Agent Browser", essential: false, installCmd: "clawhub install TheSethRose/agent-browser", description: "Headless browser automation", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/thesethrose/agent-browser" },
  { id: "chindden/skill-creator", name: "Skill Creator", essential: false, installCmd: "clawhub install chindden/skill-creator", description: "Guide for creating your own skills", githubUrl: "https://github.com/openclaw/skills/tree/main/skills/chindden/skill-creator" },
];

async function fetchSkillPresets() {
  const now = Date.now();
  if (_skillsCache && (now - _skillsCacheTime) < SKILLS_CACHE_TTL_MS) {
    return _skillsCache;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(SKILLS_API_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _skillsCache = data;
    _skillsCacheTime = now;
    return data;
  } catch {
    // Offline or API error — return cache or fallback
    return _skillsCache || FALLBACK_SKILLS;
  }
}

// Map API type or baseUrl to preset key
function detectPresetKey(provider) {
  const api = provider.api || "";
  const url = (provider.baseUrl || "").toLowerCase();
  if (api === "google-generative-ai" || url.includes("generativelanguage.googleapis.com")) return "google";
  if (api === "anthropic-messages" || url.includes("api.anthropic.com")) return "anthropic";
  if (url.includes("api.openai.com")) return "openai";
  if (url.includes("api.deepseek.com")) return "deepseek";
  if (url.includes("openrouter.ai")) return "openrouter";
  if (url.includes("api.groq.com")) return "groq";
  if (url.includes("api.mistral.ai")) return "mistral";
  return null;
}

function getProviderInfo(config) {
  const providers = config?.models?.providers ?? {};
  const entries = Object.entries(providers);
  if (entries.length === 0) return null;
  const [id, provider] = entries[0];
  const configured = (provider.models || []).map(m => m.id);
  const presetKey = MODEL_PRESETS[id] ? id : detectPresetKey(provider);
  const presets = (MODEL_PRESETS[presetKey] || []).filter(p => !configured.includes(p.id));
  return { id, presets };
}

function getAutoStartEnabled() {
  if (IS_WINDOWS) {
    const info = getWindowsTaskInfo(WINDOWS_TASKS.openclaw);
    return Boolean(info?.exists && info?.enabled);
  }

  return existsSync(OPENCLAW_PLIST_PATH);
}

function sleepSeconds(seconds) {
  if (IS_WINDOWS) {
    runPowerShell(`Start-Sleep -Seconds ${seconds}`);
    return;
  }

  execSync(`sleep ${seconds}`);
}

function startOpenClawService() {
  if (IS_WINDOWS) {
    execFileSync("schtasks.exe", ["/Run", "/TN", WINDOWS_TASKS.openclaw], { encoding: "utf-8" });
    return;
  }

  execSync("launchctl start com.openclawup.openclaw 2>/dev/null");
}

function stopWindowsOpenClawFallback() {
  if (!IS_WINDOWS) return;

  const script = `
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine -match 'start-openclaw\\.ps1' -or
          $_.CommandLine -match 'openclaw(\\.cmd)?\\s+gateway' -or
          $_.CommandLine -match 'gateway\\s+--port\\s+18789'
        )
      } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  `;

  try {
    runPowerShell(script);
  } catch {
    // Ignore cleanup failures so stop/restart can continue.
  }
}

function stopOpenClawService() {
  if (IS_WINDOWS) {
    try {
      execFileSync("schtasks.exe", ["/End", "/TN", WINDOWS_TASKS.openclaw], { encoding: "utf-8" });
    } catch {
      stopWindowsOpenClawFallback();
    }
    return;
  }

  execSync("launchctl stop com.openclawup.openclaw 2>/dev/null");
}

function restartOpenClawService() {
  stopOpenClawService();
  sleepSeconds(1);
  startOpenClawService();
}

function setOpenClawAutoStart(enabled) {
  if (IS_WINDOWS) {
    execFileSync(
      "schtasks.exe",
      ["/Change", "/TN", WINDOWS_TASKS.openclaw, enabled ? "/ENABLE" : "/DISABLE"],
      { encoding: "utf-8" },
    );
    return;
  }

  if (enabled) {
    execSync(`launchctl load "${OPENCLAW_PLIST_PATH}" 2>/dev/null`);
  } else {
    execSync(`launchctl unload "${OPENCLAW_PLIST_PATH}" 2>/dev/null`);
  }
}

function buildDiagnostics() {
  const config = readConfig();
  const env = readEnv();
  const running = isOpenClawRunning();
  const gatewayLog = readLogTail(LOG_SOURCES.gateway, 40);
  const gatewayErrorLog = readLogTail(LOG_SOURCES.gatewayError, 40);
  const managerLog = readLogTail(LOG_SOURCES.manager, 40);
  const managerErrorLog = readLogTail(LOG_SOURCES.managerError, 40);
  const openclawService = getServiceStatus("openclaw");
  const managerService = getServiceStatus("manager");
  const availableModels = extractAvailableModels(config);
  const channels = Object.entries(config?.channels ?? {})
    .filter(([, value]) => value?.enabled !== false)
    .map(([channelId]) => channelId);

  const checks = [
    {
      id: "config",
      label: "Config file",
      ok: existsSync(CONFIG_PATH),
      detail: CONFIG_PATH,
    },
    {
      id: "env",
      label: "Env file",
      ok: existsSync(ENV_PATH),
      detail: ENV_PATH,
    },
    {
      id: "openclaw_autostart",
      label: "OpenClaw auto-start",
      ok: getAutoStartEnabled(),
      detail: OPENCLAW_AUTOSTART_REF,
    },
    {
      id: "manager_autostart",
      label: "Manager auto-start",
      ok: Boolean(managerService.loaded),
      detail: MANAGER_AUTOSTART_REF,
    },
    {
      id: "service",
      label: "Service status",
      ok: running,
      detail: running ? "OpenClaw process appears healthy" : "OpenClaw service is not running",
    },
    {
      id: "channels",
      label: "Enabled channels",
      ok: channels.length > 0,
      detail: channels.length > 0 ? channels.join(", ") : "No enabled channels",
    },
    {
      id: "models",
      label: "Available models",
      ok: availableModels.length > 0,
      detail: availableModels.length > 0 ? availableModels.map((item) => item.id).join(", ") : "No models configured",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    openclawVersion: getOpenClawVersion(),
    uptime: formatUptime(getUptime()),
    running,
    paths: {
      openclawDir: OPENCLAW_DIR,
      managerDir: MANAGER_DIR,
      configPath: CONFIG_PATH,
      envPath: ENV_PATH,
      openclawAutoStart: OPENCLAW_AUTOSTART_REF,
      managerAutoStart: MANAGER_AUTOSTART_REF,
    },
    service: {
      openclaw: openclawService,
      manager: managerService,
    },
    configSummary: {
      currentModel: config?.agents?.defaults?.model?.primary ?? null,
      availableModels,
      enabledChannels: channels,
    },
    env: {
      keys: listEnvKeys(env),
      masked: Object.fromEntries(
        Object.entries(env).map(([key, value]) => [key, maskValue(value)]),
      ),
    },
    checks,
    logs: {
      gateway: gatewayLog,
      gatewayError: gatewayErrorLog,
      manager: managerLog,
      managerError: managerErrorLog,
    },
  };
}

function sanitizeFilenamePart(value) {
  return String(value)
    .replaceAll(/[^a-zA-Z0-9_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function createDiagnosticsBundle() {
  const diagnostics = buildDiagnostics();
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const workDir = mkdtempSync(join(tmpdir(), "openclawup-diagnostics-"));
  const bundleDir = join(workDir, "bundle");
  const archivePath = join(workDir, `openclawup-diagnostics-${sanitizeFilenamePart(stamp)}.zip`);

  try {
    mkdirSync(bundleDir, { recursive: true });

    writeFileSync(
      join(bundleDir, "diagnostics.json"),
      `${JSON.stringify(diagnostics, null, 2)}\n`,
      "utf-8",
    );

    for (const [source, log] of Object.entries(diagnostics.logs ?? {})) {
      const content = log?.exists ? (log.content || "") : `Log source "${source}" not found.\n`;
      writeFileSync(join(bundleDir, `${source}.log.txt`), content.endsWith("\n") ? content : `${content}\n`, "utf-8");
    }

    if (IS_WINDOWS) {
      runPowerShell(
        `Compress-Archive -Path '${join(bundleDir, "*")}' -DestinationPath '${archivePath}' -Force`,
      );
    } else {
      execFileSync("zip", ["-r", "-q", archivePath, "."], { cwd: bundleDir });
    }

    return {
      filename: `openclawup-diagnostics-${sanitizeFilenamePart(stamp)}.zip`,
      content: readFileSync(archivePath),
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ── API Routes ──────────────────────────────────────────────

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // Auth: read-only status/logs endpoints are open; everything else needs a token.
  // GET /api/auth/token has its own auth logic below.
  const isOpenEndpoint =
    (path === "/api/status" && req.method === "GET") ||
    (path === "/api/logs" && req.method === "GET");
  const isAuthEndpoint = path === "/api/auth/token";

  if (!isOpenEndpoint && !isAuthEndpoint && !checkAuth(req)) {
    return jsonResponse(res, { error: "Unauthorized", authRequired: true }, 401);
  }

  // GET /api/auth/token — first-time setup or retrieve with existing token
  if (path === "/api/auth/token" && req.method === "GET") {
    const tokenExists = existsSync(AUTH_TOKEN_PATH) && readFileSync(AUTH_TOKEN_PATH, "utf-8").trim().length > 0;
    if (!tokenExists) {
      // First-time: generate and return
      const token = getOrCreateAuthToken();
      return jsonResponse(res, { token });
    }
    // Token already exists — require the current token
    if (!checkAuth(req)) {
      return jsonResponse(res, { error: "Unauthorized", authRequired: true }, 401);
    }
    const token = readFileSync(AUTH_TOKEN_PATH, "utf-8").trim();
    return jsonResponse(res, { token });
  }

  // GET /api/status
  if (path === "/api/status" && req.method === "GET") {
    const running = isOpenClawRunning();
    const version = getOpenClawVersion();
    const uptime = getUptime();
    const config = readConfig();

    // Extract enabled channels with bot names
    const channels = extractChannelInfo(config);

    // Extract current model
    const model = config?.agents?.defaults?.model?.primary || "unknown";
    const availableModels = extractAvailableModels(config);

    // Check auto-start
    const autoStart = getAutoStartEnabled();

    // Gateway token for WebChat auth
    const gatewayToken = config?.gateway?.auth?.token || null;
    const providerInfo = getProviderInfo(config);

    return jsonResponse(res, {
      running,
      version,
      uptime: formatUptime(uptime),
      channels,
      model,
      autoStart,
      availableModels,
      aiMode: readEnv().OPENCLAWUP_API_KEY ? "proxy" : "byok",
      gatewayToken,
      modelPresets: providerInfo?.presets || [],
    });
  }

  // GET /api/logs
  if (path === "/api/logs" && req.method === "GET") {
    const source = url.searchParams.get("source") || "gateway";
    const validSource = Object.hasOwn(LOG_SOURCES, source) ? source : "gateway";
    const lines = Number.parseInt(url.searchParams.get("lines") || "120", 10);
    const maxLines = Number.isFinite(lines) ? Math.min(Math.max(lines, 20), 400) : 120;
    return jsonResponse(res, {
      source: validSource,
      ...readLogTail(LOG_SOURCES[validSource], maxLines),
    });
  }

  // GET /api/diagnostics
  if (path === "/api/diagnostics" && req.method === "GET") {
    return jsonResponse(res, buildDiagnostics());
  }

  // GET /api/diagnostics/download
  if (path === "/api/diagnostics/download" && req.method === "GET") {
    try {
      const bundle = createDiagnosticsBundle();
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bundle.filename}"`,
        "Content-Length": bundle.content.length,
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(bundle.content);
    } catch (error) {
      return jsonResponse(res, { error: error?.message || "Failed to create diagnostics bundle" }, 500);
    }
  }

  // POST /api/restart
  if (path === "/api/restart" && req.method === "POST") {
    try {
      restartOpenClawService();
      return jsonResponse(res, { ok: true });
    } catch {
      return jsonResponse(res, { error: "Failed to restart" }, 500);
    }
  }

  // POST /api/stop
  if (path === "/api/stop" && req.method === "POST") {
    try {
      stopOpenClawService();
      return jsonResponse(res, { ok: true });
    } catch {
      return jsonResponse(res, { error: "Failed to stop" }, 500);
    }
  }

  // POST /api/start
  if (path === "/api/start" && req.method === "POST") {
    try {
      startOpenClawService();
      return jsonResponse(res, { ok: true });
    } catch {
      return jsonResponse(res, { error: "Failed to start" }, 500);
    }
  }

  // GET /api/config
  if (path === "/api/config" && req.method === "GET") {
    const config = readConfig();
    const env = readEnv();
    // Mask sensitive values
    const maskedEnv = {};
    for (const [k, v] of Object.entries(env)) {
      maskedEnv[k] = maskValue(v);
    }
    return jsonResponse(res, { config, env: maskedEnv });
  }

  // PUT /api/config/channel
  if (path === "/api/config/channel" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { action, channelId, token } = JSON.parse(body);
        if (!isValidChannelId(channelId)) {
          return jsonResponse(res, { error: "Invalid channel ID" }, 400);
        }
        if (token && (typeof token !== "string" || token.length > MAX_TOKEN_LEN)) {
          return jsonResponse(res, { error: "Invalid token" }, 400);
        }
        const config = readConfig();
        if (!config) return jsonResponse(res, { error: "Config not found" }, 500);

        if (action === "add") {
          if (!config.channels) config.channels = {};
          const channelConfig = { enabled: true };
          const envKey = getChannelEnvKey(channelId);

          // Set token in env
          if (token) {
            const env = readEnv();
            env[envKey] = token;
            writeEnv(env);

            // Reference token from env in config
            if (channelId === "telegram") {
              channelConfig.botToken = `\${TELEGRAM_BOT_TOKEN}`;
              channelConfig.dmPolicy = "open";
              channelConfig.allowFrom = ["*"];
              channelConfig.streaming = "partial";
            } else if (channelId === "discord") {
              channelConfig.token = `\${DISCORD_BOT_TOKEN}`;
            } else if (channelId === "slack") {
              channelConfig.token = `\${SLACK_BOT_TOKEN}`;
            } else {
              channelConfig.token = `\${${envKey}}`;
            }

            // Fetch bot name and store in separate metadata (not in openclaw.json)
            const botName = await fetchBotName(channelId, token);
            if (botName) {
              const meta = readChannelMeta();
              meta[channelId] = { botName };
              writeChannelMeta(meta);
            }
          }

          config.channels[channelId] = channelConfig;
        } else if (action === "remove") {
          if (config.channels?.[channelId]) {
            delete config.channels[channelId];
          }
          // Clean up metadata
          const meta = readChannelMeta();
          if (meta[channelId]) {
            delete meta[channelId];
            writeChannelMeta(meta);
          }
        }

        writeConfig(config);
        return jsonResponse(res, { ok: true });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // PUT /api/config/model
  if (path === "/api/config/model" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { model } = JSON.parse(body);
        const config = readConfig();
        if (!config) return jsonResponse(res, { error: "Config not found" }, 500);

        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        if (!config.agents.defaults.model) config.agents.defaults.model = {};
        config.agents.defaults.model.primary = model;

        writeConfig(config);
        return jsonResponse(res, { ok: true });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // POST /api/config/model — add a new model to the current provider
  if (path === "/api/config/model" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { modelId, displayName } = JSON.parse(body);
        if (!modelId || !isValidModelId(modelId)) {
          return jsonResponse(res, { error: "Invalid modelId (alphanumeric, dots, hyphens, slashes only, max 128 chars)" }, 400);
        }
        const config = readConfig();
        if (!config) return jsonResponse(res, { error: "Config not found" }, 500);

        // Find first provider and add model to it
        const providers = config?.models?.providers;
        if (!providers) return jsonResponse(res, { error: "No providers configured" }, 400);
        const [providerId, provider] = Object.entries(providers)[0];
        if (!Array.isArray(provider.models)) provider.models = [];

        // Check duplicate
        if (provider.models.some(m => m.id === modelId)) {
          return jsonResponse(res, { error: "Model already exists" }, 400);
        }

        provider.models.push({ id: modelId, name: displayName || modelId });
        writeConfig(config);
        return jsonResponse(res, { ok: true, fullId: `${providerId}/${modelId}` });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // DELETE /api/config/model — remove a model from provider
  if (path === "/api/config/model" && req.method === "DELETE") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { modelId } = JSON.parse(body);
        if (!modelId) return jsonResponse(res, { error: "modelId required" }, 400);
        const config = readConfig();
        if (!config) return jsonResponse(res, { error: "Config not found" }, 500);

        const providers = config?.models?.providers;
        if (!providers) return jsonResponse(res, { error: "No providers configured" }, 400);

        // modelId is "provider/model" format
        const slashIdx = modelId.indexOf("/");
        const providerId = slashIdx > 0 ? modelId.slice(0, slashIdx) : Object.keys(providers)[0];
        const rawId = slashIdx > 0 ? modelId.slice(slashIdx + 1) : modelId;

        const provider = providers[providerId];
        if (!provider?.models) return jsonResponse(res, { error: "Provider not found" }, 400);
        if (provider.models.length <= 1) return jsonResponse(res, { error: "Cannot remove last model" }, 400);

        provider.models = provider.models.filter(m => m.id !== rawId);

        // If active model was deleted, switch to first remaining
        const currentModel = config?.agents?.defaults?.model?.primary;
        if (currentModel === modelId || currentModel === `${providerId}/${rawId}`) {
          config.agents.defaults.model.primary = `${providerId}/${provider.models[0].id}`;
        }

        writeConfig(config);
        return jsonResponse(res, { ok: true });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // PUT /api/config/autostart
  if (path === "/api/config/autostart" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { enabled } = JSON.parse(body);
        setOpenClawAutoStart(enabled);
        return jsonResponse(res, { ok: true });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // GET /api/config/skill — read current SOUL.md + skill metadata
  if (path === "/api/config/skill" && req.method === "GET") {
    const config = readConfig();
    const rawWorkspace = config?.agents?.defaults?.workspace || join(OPENCLAW_DIR, "workspace");
    // Prevent path traversal — resolve and ensure it's under OPENCLAW_DIR or HOME_DIR
    const { resolve } = require("node:path");
    const workspace = resolve(rawWorkspace);
    if (!workspace.startsWith(resolve(OPENCLAW_DIR)) && !workspace.startsWith(resolve(HOME_DIR))) {
      return jsonResponse(res, { error: "Invalid workspace path" }, 400);
    }
    const soulPath = join(workspace, "SOUL.md");
    const meta = readSkillMeta();
    let soulContent = "";
    try {
      if (existsSync(soulPath)) {
        soulContent = readFileSync(soulPath, "utf-8");
      }
    } catch {}
    return jsonResponse(res, {
      description: meta?.description || "",
      systemPrompt: soulContent,
      soulPath,
      generatedAt: meta?.generatedAt || null,
    });
  }

  // GET /api/config/skill-presets — return skill presets from platform registry
  if (path === "/api/config/skill-presets" && req.method === "GET") {
    const presets = await fetchSkillPresets();
    return jsonResponse(res, presets);
  }

  // POST /api/config/skill-generate — generate SOUL.md content from description
  if (path === "/api/config/skill-generate" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { description } = JSON.parse(body);
        if (!description?.trim()) {
          return jsonResponse(res, { error: "Description is required" }, 400);
        }

        const metaPrompt = `You are a prompt engineer. Based on the user's description below, create the content for a SOUL.md file that defines an AI chatbot's personality and behavior. This file is injected into the bot's system prompt on every conversation turn.

The bot runs in messaging apps (Telegram, Discord, WhatsApp, etc.) via OpenClaw.

Requirements:
- Define the bot's role, expertise, and personality clearly
- Set an appropriate tone for the use case (professional, friendly, casual, etc.)
- Specify what the bot should and shouldn't do
- Include practical response guidelines suited for chat (keep messages concise, use formatting sparingly, etc.)
- Write in markdown format with clear sections
- Keep it focused and practical (200-400 words)

User's description of what they want their bot to do:
${description.trim()}

Output ONLY the SOUL.md content. No explanations, no outer code fences wrapping the whole thing.`;

        const generated = await callAi(metaPrompt);
        if (!generated) {
          return jsonResponse(res, { error: "AI returned empty response" }, 500);
        }

        return jsonResponse(res, { systemPrompt: generated });
      } catch (e) {
        return jsonResponse(res, { error: e.message || "Failed to generate" }, 500);
      }
    });
    return;
  }

  // PUT /api/config/skill — write SOUL.md to workspace + save metadata
  if (path === "/api/config/skill" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { systemPrompt, description } = JSON.parse(body);
        if (typeof systemPrompt !== "string") {
          return jsonResponse(res, { error: "systemPrompt is required" }, 400);
        }

        const config = readConfig();
        const workspace = config?.agents?.defaults?.workspace || join(OPENCLAW_DIR, "workspace");
        const soulPath = join(workspace, "SOUL.md");

        // Ensure workspace directory exists
        mkdirSync(workspace, { recursive: true });

        if (systemPrompt) {
          writeFileSync(soulPath, systemPrompt, "utf-8");
          writeSkillMeta({
            description: description || "",
            generatedAt: new Date().toISOString(),
          });
        } else {
          // Clear: remove SOUL.md and metadata
          if (existsSync(soulPath)) rmSync(soulPath, { force: true });
          if (existsSync(SKILL_META_PATH)) rmSync(SKILL_META_PATH, { force: true });
        }

        return jsonResponse(res, { ok: true, soulPath });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // GET /api/updates — check for available updates
  if (path === "/api/updates" && req.method === "GET") {
    const currentOpenclawVersion = getOpenClawVersion();
    const currentManagerVersion = MANAGER_VERSION;

    // Use cached GitHub response if still fresh
    const now = Date.now();
    if (_updateCache && (now - _updateCacheTime) < UPDATE_CACHE_TTL) {
      return jsonResponse(res, {
        currentManagerVersion,
        latestManagerVersion: _updateCache.tag_name?.replace(/^v/, "") || null,
        currentOpenclawVersion,
        updateAvailable: _updateCache._updateAvailable,
        releaseUrl: _updateCache.html_url || null,
      });
    }

    try {
      const ghRes = await fetch("https://api.github.com/repos/OpenClawUP/local/releases/latest", {
        headers: { "User-Agent": "OpenClawUP-Local-Manager" },
      });
      if (!ghRes.ok) throw new Error(`GitHub API returned ${ghRes.status}`);
      const release = await ghRes.json();
      const latestVersion = (release.tag_name || "").replace(/^v/, "");
      const updateAvailable = latestVersion && latestVersion !== currentManagerVersion;
      release._updateAvailable = updateAvailable;
      _updateCache = release;
      _updateCacheTime = now;
      return jsonResponse(res, {
        currentManagerVersion,
        latestManagerVersion: latestVersion || null,
        currentOpenclawVersion,
        updateAvailable,
        releaseUrl: release.html_url || null,
      });
    } catch {
      return jsonResponse(res, {
        currentManagerVersion,
        latestManagerVersion: null,
        currentOpenclawVersion,
        updateAvailable: null,
        releaseUrl: null,
      });
    }
  }

  // POST /api/update — perform update
  if (path === "/api/update" && req.method === "POST") {
    const results = { openclawUpdated: false, managerUpdated: false, managerRestartNeeded: false, errors: [] };

    // 1. Update OpenClaw via npm
    try {
      execSync("npm install -g openclaw@latest 2>&1", { encoding: "utf-8", timeout: 120000 });
      results.openclawUpdated = true;
      results.newOpenclawVersion = getOpenClawVersion();
    } catch (e) {
      results.errors.push(`OpenClaw update failed: ${e.message || "unknown error"}`);
    }

    // 2. Update manager files from GitHub
    try {
      const baseUrl = "https://raw.githubusercontent.com/OpenClawUP/local/main/manager";
      const serverRes = await fetch(`${baseUrl}/server.mjs`, { headers: { "User-Agent": "OpenClawUP-Local-Manager" } });
      if (!serverRes.ok) throw new Error(`Failed to download server.mjs: ${serverRes.status}`);
      const serverContent = await serverRes.text();

      const htmlRes = await fetch(`${baseUrl}/public/index.html`, { headers: { "User-Agent": "OpenClawUP-Local-Manager" } });
      if (!htmlRes.ok) throw new Error(`Failed to download index.html: ${htmlRes.status}`);
      const htmlContent = await htmlRes.text();

      writeFileSync(join(MANAGER_DIR, "server.mjs"), serverContent, "utf-8");
      mkdirSync(join(MANAGER_DIR, "public"), { recursive: true });
      writeFileSync(join(MANAGER_DIR, "public", "index.html"), htmlContent, "utf-8");

      results.managerUpdated = true;
      results.managerRestartNeeded = true;
    } catch (e) {
      results.errors.push(`Manager update failed: ${e.message || "unknown error"}`);
    }

    // Invalidate update cache
    _updateCache = null;
    _updateCacheTime = 0;

    const status = results.errors.length === 0 ? 200 : 207;
    return jsonResponse(res, results, status);
  }

  return jsonResponse(res, { error: "Not found" }, 404);
}

// ── Static file server ─────────────────────────────────────

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  let filePath = join(PUBLIC_DIR, req.url === "/" ? "index.html" : req.url);

  if (!existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const ext = filePath.slice(filePath.lastIndexOf("."));
  const contentType = MIME[ext] || "application/octet-stream";

  const content = readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
}

// ── Server ─────────────────────────────────────────────────

const server = createServer((req, res) => {
  // Enforce request body size limit to prevent memory exhaustion
  let bodySize = 0;
  req.on("data", (chunk) => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_BYTES) {
      req.destroy();
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request body too large" }));
    }
  });

  if (req.url.startsWith("/api/")) {
    return handleApi(req, res);
  }
  return serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`OpenClawUP Local Manager running at http://localhost:${PORT}`);
});
