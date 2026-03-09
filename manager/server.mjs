import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, execSync } from "node:child_process";

const PORT = process.env.PORT || 8080;
const OPENCLAW_DIR = process.env.OPENCLAW_DIR || join(process.env.HOME, ".openclaw");
const CONFIG_PATH = join(OPENCLAW_DIR, "openclaw.json");
const ENV_PATH = join(OPENCLAW_DIR, ".env");
const PUBLIC_DIR = join(import.meta.dirname, "public");
const MANAGER_DIR = process.cwd();
const OPENCLAW_PLIST_PATH = join(process.env.HOME, "Library/LaunchAgents/com.openclawup.openclaw.plist");
const MANAGER_PLIST_PATH = join(process.env.HOME, "Library/LaunchAgents/com.openclawup.manager.plist");
const LOG_SOURCES = {
  gateway: join(OPENCLAW_DIR, "logs", "gateway.log"),
  gatewayError: join(OPENCLAW_DIR, "logs", "gateway.err"),
  manager: join(MANAGER_DIR, "manager.log"),
  managerError: join(MANAGER_DIR, "manager.err"),
};

// ── Helpers ─────────────────────────────────────────────────

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function readConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    // Strip JSON5 comments for basic parsing
    const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function writeConfig(config) {
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

  try {
    raw = execFileSync("tail", ["-n", String(maxLines), filePath], {
      encoding: "utf-8",
    });
  } catch {
    raw = readFileSync(filePath, "utf-8");
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

function isOpenClawRunning() {
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

function buildDiagnostics() {
  const config = readConfig();
  const env = readEnv();
  const running = isOpenClawRunning();
  const gatewayLog = readLogTail(LOG_SOURCES.gateway, 40);
  const gatewayErrorLog = readLogTail(LOG_SOURCES.gatewayError, 40);
  const managerLog = readLogTail(LOG_SOURCES.manager, 40);
  const managerErrorLog = readLogTail(LOG_SOURCES.managerError, 40);
  const openclawLaunchctl = getLaunchctlStatus("com.openclawup.openclaw");
  const managerLaunchctl = getLaunchctlStatus("com.openclawup.manager");
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
      id: "openclaw_plist",
      label: "OpenClaw auto-start",
      ok: existsSync(OPENCLAW_PLIST_PATH),
      detail: OPENCLAW_PLIST_PATH,
    },
    {
      id: "manager_plist",
      label: "Manager auto-start",
      ok: existsSync(MANAGER_PLIST_PATH),
      detail: MANAGER_PLIST_PATH,
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
      openclawLaunchAgent: OPENCLAW_PLIST_PATH,
      managerLaunchAgent: MANAGER_PLIST_PATH,
    },
    service: {
      openclaw: openclawLaunchctl,
      manager: managerLaunchctl,
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

// ── API Routes ──────────────────────────────────────────────

function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // GET /api/status
  if (path === "/api/status" && req.method === "GET") {
    const running = isOpenClawRunning();
    const version = getOpenClawVersion();
    const uptime = getUptime();
    const config = readConfig();

    // Extract enabled channels
    const channels = [];
    if (config?.channels) {
      for (const [id, ch] of Object.entries(config.channels)) {
        if (ch.enabled !== false) channels.push(id);
      }
    }

    // Extract current model
    const model = config?.agents?.defaults?.model?.primary || "unknown";
    const availableModels = extractAvailableModels(config);

    // Check auto-start
    const autoStart = existsSync(OPENCLAW_PLIST_PATH);

    return jsonResponse(res, {
      running,
      version,
      uptime: formatUptime(uptime),
      channels,
      model,
      autoStart,
      availableModels,
      aiMode: readEnv().OPENCLAWUP_API_KEY ? "proxy" : "byok",
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

  // POST /api/restart
  if (path === "/api/restart" && req.method === "POST") {
    try {
      execSync("launchctl stop com.openclawup.openclaw 2>/dev/null; sleep 1; launchctl start com.openclawup.openclaw 2>/dev/null");
      return jsonResponse(res, { ok: true });
    } catch {
      return jsonResponse(res, { error: "Failed to restart" }, 500);
    }
  }

  // POST /api/stop
  if (path === "/api/stop" && req.method === "POST") {
    try {
      execSync("launchctl stop com.openclawup.openclaw 2>/dev/null");
      return jsonResponse(res, { ok: true });
    } catch {
      return jsonResponse(res, { error: "Failed to stop" }, 500);
    }
  }

  // POST /api/start
  if (path === "/api/start" && req.method === "POST") {
    try {
      execSync("launchctl start com.openclawup.openclaw 2>/dev/null");
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
    req.on("end", () => {
      try {
        const { action, channelId, token } = JSON.parse(body);
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
              channelConfig.streaming = "partial";
            } else if (channelId === "discord") {
              channelConfig.token = `\${DISCORD_BOT_TOKEN}`;
            } else if (channelId === "slack") {
              channelConfig.token = `\${SLACK_BOT_TOKEN}`;
            } else {
              channelConfig.token = `\${${envKey}}`;
            }
          }

          config.channels[channelId] = channelConfig;
        } else if (action === "remove") {
          if (config.channels?.[channelId]) {
            delete config.channels[channelId];
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

  // PUT /api/config/autostart
  if (path === "/api/config/autostart" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { enabled } = JSON.parse(body);
        const plistPath = join(process.env.HOME, "Library/LaunchAgents/com.openclawup.openclaw.plist");

        if (enabled) {
          execSync(`launchctl load "${plistPath}" 2>/dev/null`);
        } else {
          execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
        }
        return jsonResponse(res, { ok: true });
      } catch (e) {
        return jsonResponse(res, { error: e.message }, 400);
      }
    });
    return;
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
  if (req.url.startsWith("/api/")) {
    return handleApi(req, res);
  }
  return serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`OpenClawUP Local Manager running at http://localhost:${PORT}`);
});
