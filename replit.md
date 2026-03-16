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
- **Package Manager**: pnpm
- **Frontend**: Lit (web components) + Vite 8 build tool
- **Backend**: Hono framework, Express
- **Build**: tsdown (TypeScript bundler)

## Running the Project

### Development (Web UI)

The Vite dev server runs the web control UI:

```bash
cd ui && node node_modules/.bin/vite
```

This serves the UI on port 5000.

### Gateway (Backend)

```bash
pnpm dev
# or
node scripts/run-node.mjs
```

## Configuration

Copy `.env.example` to `.env` and fill in your API keys:

- `OPENCLAW_GATEWAY_TOKEN` - Gateway auth token (required for production)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. - AI provider keys
- `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, etc. - Messaging channel tokens

## Workflow

- **Start application** - Runs the Vite dev server for the web UI on port 5000

## Deployment

Configured as a static site deployment:
- Build: `cd ui && node node_modules/.bin/vite build`
- Output: `dist/control-ui/`
