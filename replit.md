# OpenClaw

OpenClaw is a multi-channel AI gateway with extensible messaging integrations. It acts as a personal AI assistant that runs on your own devices, connecting various messaging platforms (WhatsApp, Telegram, Slack, Discord, etc.) with LLM providers.

## Project Structure

This is a pnpm monorepo with the following main components:

- **`src/`** - Core gateway, CLI, and business logic (TypeScript/Node.js)
- **`ui/`** - Web-based control interface (Lit + Vite, static SPA)
- **`extensions/`** - Plugin integrations for messaging platforms and AI models
- **`skills/`** - Specific assistant capabilities
- **`packages/`** - Internal packages (e.g., clawdbot)
- **`apps/`** - Native platform apps (iOS, macOS, Android)
- **`docs/`** - Documentation

## Tech Stack

- **Runtime**: Node.js v20
- **Package Manager**: pnpm (use `npm install` in Replit to avoid UPM loop)
- **Frontend**: Lit (web components) + Vite 8 build tool
- **Backend**: Hono framework, Express
- **Build**: tsdown (TypeScript bundler)

## Replit Setup

### AI Backend: Cloudflare Workers AI

Credentials stored in `.env`:
- `CLOUDFLARE_ACCOUNT_ID` = `6c807fe58ad83714e772403cd528dbeb`
- `CLOUDFLARE_GATEWAY_ID` = `dzeck`
- `CLOUDFLARE_AI_GATEWAY_API_KEY` = your API key
- `OPENCLAW_GATEWAY_TOKEN` = `dzeck-openclaw-gateway-2024`

Model: `@cf/meta/llama-3-8b-instruct` via `https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/v1`

### Running on Replit

Two workflows must both be running:

1. **Gateway Server** — `node gateway-server.js` (port 8080)
   - OpenClaw-compatible WebSocket server
   - Implements the full client↔server protocol
   - Forwards chat messages to Cloudflare Workers AI with streaming

2. **Start application** — `cd ui && node node_modules/.bin/vite` (port 5000)
   - Vite dev server for the web control UI
   - Proxies `/ws` to `ws://localhost:8080` (the gateway)

### Connecting the UI

In the OpenClaw web UI, when prompted for the gateway URL use:

```
wss://3b0205e9-73aa-4151-8405-3fdfd3b88c4c-00-3l24myq2muk52.sisko.replit.dev/ws
```

Gateway token: `dzeck-openclaw-gateway-2024`

The `/ws` path is proxied by Vite to the gateway server on port 8080.

### Note on pnpm

Replit's UPM intercepts `pnpm install` and causes infinite loops. Always use:
```bash
cd ui && npm install   # for ui packages
```

Or reference packages directly from `ui/node_modules/`.

## Configuration

Copy `.env.example` to `.env` and fill in your API keys:

- `OPENCLAW_GATEWAY_TOKEN` - Gateway auth token (required for production)
- `CLOUDFLARE_AI_GATEWAY_API_KEY` - Cloudflare AI key
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `CLOUDFLARE_GATEWAY_ID` - AI Gateway ID

## Workflows

- **Start application** - Runs the Vite dev server for the web UI on port 5000
- **Gateway Server** - Runs the OpenClaw-compatible WebSocket gateway on port 8080

## Deployment

Configured as a static site deployment:
- Build: `cd ui && node node_modules/.bin/vite build`
- Output: `dist/control-ui/`
