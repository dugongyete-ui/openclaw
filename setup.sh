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

# ─── 2. Install dependensi UI (via npm langsung) ───────────
log "Menginstall dependensi UI (ui/node_modules)..."
if [ ! -f "ui/node_modules/.bin/vite" ]; then
  cd ui
  npm install --prefer-offline --loglevel=warn 2>&1 | grep -E "(added|updated|warn|error)" || true
  cd ..
  ok "Dependensi UI selesai diinstall"
else
  ok "Dependensi UI sudah ada (skip)"
fi

# ─── 3. Install dependensi root (untuk gateway backend) ────
log "Menginstall dependensi root (diperlukan untuk gateway)..."
if [ ! -d "node_modules" ]; then
  # Pakai npm untuk menghindari bug pnpm self-install di Replit
  npm install --prefer-offline --loglevel=warn \
    --ignore-scripts \
    2>&1 | grep -E "(added|updated|warn|error)" || true
  ok "Dependensi root selesai"
else
  ok "Dependensi root sudah ada (skip)"
fi

# ─── 4. Cek vite tersedia ──────────────────────────────────
if [ -f "ui/node_modules/.bin/vite" ]; then
  VITE_VER=$(node ui/node_modules/.bin/vite --version 2>/dev/null | head -1)
  ok "Vite: $VITE_VER"
fi

# ─── 5. Salin .env jika belum ada ──────────────────────────
if [ ! -f ".env" ]; then
  log "Membuat file .env dari contoh..."
  cp .env.example .env
  warn "File .env dibuat. Isi API key yang diperlukan."
else
  ok "File .env sudah ada"
fi

# ─── 6. Buat folder dan salin config openclaw ──────────────
mkdir -p ~/.openclaw
ok "Folder ~/.openclaw siap"
if [ -f "openclaw.json" ]; then
  cp openclaw.json "$HOME/.openclaw/openclaw.json"
  ok "openclaw.json disalin ke ~/.openclaw/"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Setup Selesai!                          ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Jalankan UI       : cd ui && node node_modules/.bin/vite"
echo "║  Jalankan Gateway  : node scripts/run-node.mjs       ║"
echo "║                                                      ║"
echo "║  Koneksi dari UI:                                    ║"
echo "║    WebSocket URL : ws://localhost:18789              ║"
echo "║    Gateway Token : dzeck-openclaw-gateway-2024       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
