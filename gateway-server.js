/**
 * OpenClaw-Compatible Gateway Server
 * Implements the OpenClaw WebSocket protocol and forwards chat to Cloudflare Workers AI
 * Port: 8080 (proxied via Vite /ws)
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import wsPkg from "./ui/node_modules/ws/index.js";
const { WebSocketServer } = wsPkg;

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ───────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dir, ".env"), "utf8");
    const vars = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return vars;
  } catch {
    return {};
  }
}

const env = { ...process.env, ...loadEnv() };

const GATEWAY_TOKEN  = env.OPENCLAW_GATEWAY_TOKEN || "dzeck-openclaw-gateway-2024";
const CF_API_KEY     = env.CLOUDFLARE_AI_GATEWAY_API_KEY || env.AI_GATEWAY_API_KEY || "";
const CF_ACCOUNT_ID  = env.CLOUDFLARE_ACCOUNT_ID || "6c807fe58ad83714e772403cd528dbeb";
const CF_GATEWAY_ID  = env.CLOUDFLARE_GATEWAY_ID || "dzeck";
const PORT           = Number(env.OPENCLAW_GATEWAY_PORT || 8080);

const CF_BASE_URL = `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_ID}/workers-ai/v1`;
const CF_MODEL    = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM_PROMPT = { role: "system", content: "You are OpenClaw, a helpful AI assistant. Be concise and direct." };

console.log(`[gateway] Token   : ${GATEWAY_TOKEN}`);
console.log(`[gateway] CF URL  : ${CF_BASE_URL}`);
console.log(`[gateway] Model   : ${CF_MODEL}`);

// ─── Cloudflare Workers AI (OpenAI-compat) ──────────────────────────────────
async function callCloudflare(messages) {
  const url = `${CF_BASE_URL}/chat/completions`;
  const body = JSON.stringify({
    model: CF_MODEL,
    messages,
    stream: true,
    max_tokens: 2048,
    temperature: 0.7,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare error ${res.status}: ${err}`);
  }
  return res;
}

// ─── Session Store (in-memory) ──────────────────────────────────────────────
const sessions = new Map();
let totalMessages = 0;

function getOrCreateSession(key) {
  if (!sessions.has(key)) {
    sessions.set(key, {
      key,
      name: "Chat",
      messages: [],
      inputTokens: 0,
      outputTokens: 0,
      lastActive: Date.now(),
    });
  }
  return sessions.get(key);
}

// ─── Protocol helpers ────────────────────────────────────────────────────────
function send(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

function respondOk(ws, id, payload = {}) {
  send(ws, { type: "res", id, ok: true, payload });
}

function respondErr(ws, id, code, message) {
  send(ws, { type: "res", id, ok: false, error: { code, message } });
}

function sendEvent(ws, event, payload) {
  send(ws, { type: "event", event, payload });
}

// ─── Handle chat.send ───────────────────────────────────────────────────────
async function handleChatSend(ws, params, id) {
  const sessionKey = params.sessionKey || "default";
  const runId      = params.idempotencyKey || crypto.randomUUID();
  const userMsg    = typeof params.message === "string" ? params.message : "";

  // Respond immediately to the request
  respondOk(ws, id, { runId, sessionKey });

  // Update session history
  const session = getOrCreateSession(sessionKey);
  session.messages.push({ role: "user", content: userMsg, timestamp: Date.now() });
  session.lastActive = Date.now();
  session.inputTokens += Math.ceil(userMsg.length / 4);
  totalMessages += 1;

  // Build messages for AI (system prompt + last 10 for context)
  const history = [
    SYSTEM_PROMPT,
    ...session.messages.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    })),
  ];

  let seq = 0;
  let assistantText = "";

  try {
    const res = await callCloudflare(history);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            assistantText += delta;
            // Send streaming text event
            sendEvent(ws, "agent", {
              runId,
              seq: ++seq,
              stream: "assistant",
              ts: Date.now(),
              sessionKey,
              data: { text: delta },
            });
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error("[gateway] Cloudflare error:", err.message);
    sendEvent(ws, "agent", {
      runId,
      seq: ++seq,
      stream: "assistant",
      ts: Date.now(),
      sessionKey,
      data: { text: `\n\n⚠️ Error: ${err.message}` },
    });
  }

  // Save assistant response to history
  session.messages.push({ role: "assistant", content: assistantText, timestamp: Date.now() });
  session.outputTokens += Math.ceil(assistantText.length / 4);
  totalMessages += 1;

  // Send lifecycle end event
  sendEvent(ws, "agent", {
    runId,
    seq: ++seq,
    stream: "lifecycle",
    ts: Date.now(),
    sessionKey,
    data: {
      phase: "end",
      selectedProvider: "cloudflare-workers-ai",
      selectedModel: CF_MODEL,
    },
  });
}

// ─── WebSocket Server ────────────────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OpenClaw Gateway OK");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  console.log(`[gateway] Client connected from ${req.socket.remoteAddress}`);
  let authenticated = false;

  ws.on("message", async (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { type, id, method, params = {} } = frame;
    if (type !== "req") return;

    // ── connect (auth) ──────────────────────────────────────────────────────
    if (method === "connect") {
      const token = params.authToken?.trim() || params.authPassword?.trim() || "";
      if (token && token !== GATEWAY_TOKEN) {
        respondErr(ws, id, "AUTH_TOKEN_MISMATCH", "Invalid gateway token");
        return;
      }
      authenticated = true;
      const sessionList = Array.from(sessions.values()).map((s) => ({
        key: s.key,
        name: s.name,
        messageCount: s.messages.length,
        lastActive: s.lastActive,
      }));
      if (sessionList.length === 0) {
        sessionList.push({ key: "default", name: "Chat", messageCount: 0, lastActive: Date.now() });
      }
      respondOk(ws, id, {
        type: "hello-ok",
        protocol: 1,
        server: { version: "2026.3.14", connId: crypto.randomUUID() },
        features: {
          methods: [
            "chat.send", "chat.history", "models.list", "sessions.list", "health",
            "nodes.list", "instances.list", "skills.list", "cron.list",
            "agents.list", "channels.list", "overview.get", "usage.status", "usage.cost",
          ],
          events: ["agent"],
        },
        snapshot: {
          sessions: sessionList,
          channels: [],
        },
      });
      console.log(`[gateway] Client authenticated`);
      return;
    }

    // Require auth for all other methods
    if (!authenticated) {
      respondErr(ws, id, "AUTH_REQUIRED", "Please connect first");
      return;
    }

    // ── health ───────────────────────────────────────────────────────────────
    if (method === "health") {
      respondOk(ws, id, { status: "ok", channels: [] });
      return;
    }

    // ── sessions.list ────────────────────────────────────────────────────────
    if (method === "sessions.list" || method === "sessions.get") {
      const sessionList = Array.from(sessions.values()).map((s) => ({
        key: s.key,
        name: s.name,
        messageCount: s.messages.length,
        lastActive: s.lastActive,
        agentId: null,
      }));
      if (sessionList.length === 0) {
        sessionList.push({ key: "default", name: "Chat", messageCount: 0, lastActive: Date.now(), agentId: null });
      }
      respondOk(ws, id, { sessions: sessionList });
      return;
    }

    // ── chat.history ─────────────────────────────────────────────────────────
    if (method === "chat.history") {
      const sessionKey = params.sessionKey || "default";
      const session = getOrCreateSession(sessionKey);
      const limit = params.limit || 200;
      const msgs = session.messages.slice(-limit).map((m) => ({
        role: m.role,
        content: [{ type: "text", text: m.content }],
        timestamp: m.timestamp,
      }));
      respondOk(ws, id, { messages: msgs });
      return;
    }

    // ── models.list ──────────────────────────────────────────────────────────
    if (method === "models.list") {
      respondOk(ws, id, {
        models: [
          {
            id: `cloudflare-workers-ai/${CF_MODEL}`,
            name: "Llama 3.1 8B Instruct",
            provider: "cloudflare-workers-ai",
            model: CF_MODEL,
            input: ["text"],
            contextWindow: 8192,
            maxTokens: 2048,
          },
        ],
        defaultModel: `cloudflare-workers-ai/${CF_MODEL}`,
      });
      return;
    }

    // ── chat.send ────────────────────────────────────────────────────────────
    if (method === "chat.send" || method === "send") {
      await handleChatSend(ws, params, id);
      return;
    }

    // ── chat.abort ───────────────────────────────────────────────────────────
    if (method === "chat.abort") {
      respondOk(ws, id, { aborted: true });
      return;
    }

    // ── channels.status / channels.list ──────────────────────────────────────
    if (method === "channels.status" || method === "channels.list") {
      respondOk(ws, id, { channels: [] });
      return;
    }

    // ── agents.list ──────────────────────────────────────────────────────────
    if (method === "agents.list") {
      respondOk(ws, id, {
        agents: [
          {
            id: "default",
            name: "Assistant",
            description: "OpenClaw AI assistant powered by Cloudflare Workers AI",
            model: CF_MODEL,
            provider: "cloudflare-workers-ai",
            status: "active",
            capabilities: ["chat"],
          },
        ],
      });
      return;
    }

    // ── nodes.list ───────────────────────────────────────────────────────────
    if (method === "nodes.list") {
      respondOk(ws, id, {
        nodes: [
          { id: "local", name: "This Device", status: "online", platform: "web" },
        ],
      });
      return;
    }

    // ── instances.list ───────────────────────────────────────────────────────
    if (method === "instances.list") {
      respondOk(ws, id, {
        instances: [
          { id: "default", name: "OpenClaw Instance", status: "running" },
        ],
      });
      return;
    }

    // ── skills.list ──────────────────────────────────────────────────────────
    if (method === "skills.list") {
      respondOk(ws, id, { skills: [] });
      return;
    }

    // ── cron.list ────────────────────────────────────────────────────────────
    if (method === "cron.list") {
      respondOk(ws, id, { jobs: [] });
      return;
    }

    // ── overview.get / stats.get ─────────────────────────────────────────────
    if (method === "overview.get" || method === "stats.get") {
      respondOk(ws, id, {
        sessions: sessions.size,
        messages: totalMessages,
        uptime: process.uptime(),
      });
      return;
    }

    // ── config.get ───────────────────────────────────────────────────────────
    if (method === "config.get") {
      respondOk(ws, id, {
        raw: JSON.stringify({
          ai: {
            model: CF_MODEL,
            provider: "cloudflare-workers-ai",
            contextWindow: 8192,
            maxTokens: 2048,
            temperature: 0.7,
          },
        }),
        baseHash: "",
      });
      return;
    }

    // ── agent.identity.get ───────────────────────────────────────────────────
    if (method === "agent.identity.get") {
      respondOk(ws, id, { agentId: "default", name: "OpenClaw AI", avatar: null });
      return;
    }

    // ── usage.status / usage.cost ────────────────────────────────────────────
    if (method === "usage.status" || method === "usage.cost") {
      const allSessions = Array.from(sessions.values());
      const totalInput = allSessions.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
      const totalOutput = allSessions.reduce((sum, s) => sum + (s.outputTokens || 0), 0);
      const sessionUsage = allSessions.map((s) => ({
        key: s.key,
        name: s.name,
        inputTokens: s.inputTokens || 0,
        outputTokens: s.outputTokens || 0,
        totalMessages: s.messages.length,
      }));
      respondOk(ws, id, {
        usage: {
          inputTokens: totalInput,
          outputTokens: totalOutput,
          totalTokens: totalInput + totalOutput,
          totalMessages,
          sessions: sessionUsage,
        },
        cost: {
          estimated: ((totalInput + totalOutput) * 0.0000002).toFixed(6),
          currency: "USD",
        },
      });
      return;
    }

    // ── Catch-all: log and return empty success ───────────────────────────────
    console.log(`[gateway] Unhandled method: ${method}`, JSON.stringify(params));
    respondOk(ws, id, {});
  });

  ws.on("close", () => {
    console.log(`[gateway] Client disconnected`);
  });

  ws.on("error", (err) => {
    console.error(`[gateway] WS error:`, err.message);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway] Listening on ws://0.0.0.0:${PORT}`);
});
