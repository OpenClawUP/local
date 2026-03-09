import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync, exec } from "node:child_process";

const PORT = process.env.PORT || 8080;
const OPENCLAW_DIR = process.env.OPENCLAW_DIR || join(process.env.HOME, ".openclaw");
const CONFIG_PATH = join(OPENCLAW_DIR, "openclaw.json");
const ENV_PATH = join(OPENCLAW_DIR, ".env");
const PUBLIC_DIR = join(import.meta.dirname, "public");

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
    const plistPath = join(process.env.HOME, "Library/LaunchAgents/com.openclawup.openclaw.plist");
    if (!existsSync(plistPath)) return null;
    const stat = statSync(plistPath);
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

    // Check auto-start
    const autoStart = existsSync(
      join(process.env.HOME, "Library/LaunchAgents/com.openclawup.openclaw.plist")
    );

    return jsonResponse(res, {
      running,
      version,
      uptime: formatUptime(uptime),
      channels,
      model,
      autoStart,
    });
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
      maskedEnv[k] = v.length > 8 ? v.slice(0, 4) + "..." + v.slice(-4) : "****";
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

          // Set token in env
          if (token) {
            const env = readEnv();
            const envKey = `${channelId.toUpperCase()}_BOT_TOKEN`;
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
