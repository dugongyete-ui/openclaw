#!/usr/bin/env bash
# ============================================================
#  OpenClaw – Script Instalasi Cepat
#  Jalankan: bash setup.sh
# ============================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   OpenClaw – Setup & Dependency Install  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 1. Pastikan Node.js tersedia ──────────────────────────
log "Memeriksa Node.js..."
node --version &>/dev/null || err "Node.js tidak ditemukan."
ok "Node.js $(node --version) tersedia"

# ─── 2. Install dependensi root ─────────────────────────────
#   Dibutuhkan oleh: npm run dev  →  tsx server/index.ts
#   (express, tsx, drizzle-orm, nanoid, dst)
log "Menginstall dependensi root (node_modules)..."
if [ ! -f "node_modules/.bin/tsx" ]; then
  npm install --prefer-offline --loglevel=warn \
    --ignore-scripts \
    2>&1 | grep -E "(added|updated|warn|error)" || true
  ok "Dependensi root selesai diinstall"
else
  ok "Dependensi root sudah ada (skip)"
fi

# ─── 3. Install dependensi UI ───────────────────────────────
#   Dibutuhkan oleh:
#   - Vite dev server  → melayani openclaw control UI (ui/)
#   - gateway-server.js → pakai ws dari ui/node_modules/ws
log "Menginstall dependensi UI (ui/node_modules)..."
if [ ! -f "ui/node_modules/.bin/vite" ]; then
  cd ui
  npm install --prefer-offline --loglevel=warn 2>&1 | grep -E "(added|updated|warn|error)" || true
  cd ..
  ok "Dependensi UI selesai diinstall"
else
  ok "Dependensi UI sudah ada (skip)"
fi

# ─── 4. Verifikasi binary penting ──────────────────────────
if [ -f "node_modules/.bin/tsx" ]; then
  ok "tsx: tersedia"
fi
if [ -f "ui/node_modules/.bin/vite" ]; then
  VITE_VER=$(node ui/node_modules/.bin/vite --version 2>/dev/null | head -1)
  ok "Vite: $VITE_VER"
fi
if [ -f "ui/node_modules/ws/index.js" ]; then
  ok "ws (WebSocket): tersedia di ui/node_modules"
fi

# ─── 5. Siapkan .env ────────────────────────────────────────
if [ ! -f ".env" ]; then
  log "Membuat file .env dari contoh..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    cat > .env << 'ENVEOF'
OPENCLAW_GATEWAY_TOKEN=dzeck-openclaw-gateway-2024
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_GATEWAY_ID=
CLOUDFLARE_AI_GATEWAY_API_KEY=
ENVEOF
  fi
  warn "File .env dibuat. Isi CLOUDFLARE_* credentials yang diperlukan."
else
  ok "File .env sudah ada"
  # Cek apakah Cloudflare key sudah diisi
  if grep -q "CLOUDFLARE_AI_GATEWAY_API_KEY=" .env; then
    CF_KEY=$(grep "^CLOUDFLARE_AI_GATEWAY_API_KEY=" .env | cut -d= -f2 | tr -d '"' | tr -d "'")
    if [ -z "$CF_KEY" ]; then
      warn "CLOUDFLARE_AI_GATEWAY_API_KEY belum diisi di .env"
    else
      ok "Cloudflare AI Gateway key: dikonfigurasi"
    fi
  fi
fi

# ─── 6. Salin openclaw.json ke ~/.openclaw ──────────────────
mkdir -p ~/.openclaw
ok "Folder ~/.openclaw siap"
if [ -f "openclaw.json" ]; then
  cp openclaw.json "$HOME/.openclaw/openclaw.json"
  ok "openclaw.json disalin ke ~/.openclaw/"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Setup Selesai!                            ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Cara menjalankan (cukup SATU perintah):                    ║"
echo "║    npm run dev                                               ║"
echo "║                                                              ║"
echo "║  Yang akan berjalan otomatis:                               ║"
echo "║    ├─ Express + OpenClaw UI  →  http://localhost:5000        ║"
echo "║    ├─ Gateway WebSocket      →  ws://localhost:8080          ║"
echo "║    └─ WS Proxy (port 5000/)  →  diteruskan ke gateway       ║"
echo "║                                                              ║"
echo "║  Konfigurasi browser otomatis:                              ║"
echo "║    Gateway URL  : wss://<domain>/  (dari URL halaman)        ║"
echo "║    Gateway Token: dzeck-openclaw-gateway-2024               ║"
echo "║    (Sudah di-inject ke localStorage/sessionStorage)          ║"
echo "║                                                              ║"
echo "║  AI Backend : Cloudflare Workers AI                         ║"
echo "║    Model    : @cf/meta/llama-3-8b-instruct                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
