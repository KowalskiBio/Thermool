#!/bin/bash
# Deploys the current branch of this Thermool checkout to the VM's live
# service (systemd --user thermool.service, serving ~/Thermool/thermool +
# ~/Thermool/frontend/dist on 127.0.0.1:8003). Modelled on Primerool's
# scripts/deploy_vm.sh.
#
# Expected layout (Thermool builds against Primerool's crates via ../Primerool):
#   ~/thermool-src/Thermool    this checkout
#   ~/thermool-src/Primerool   symlink to ~/primerool-src (the deployed Primerool)
#
# Run from inside the checkout: ./scripts/deploy_vm.sh
#
# Safety: refuses to run with uncommitted changes, only fast-forwards from
# origin, builds before touching anything live, backs up the live directory,
# health-checks after restart and rolls back automatically on failure.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="$HOME/Thermool"
BACKUP_DIR="$HOME/Thermool.autobak.$(date +%Y%m%d-%H%M%S)"
SERVICE="thermool.service"
HEALTH_URL="http://127.0.0.1:8003/api/health"
KEEP_BACKUPS=3
# Share Primerool's build directory: same dependencies, far less disk.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/primerool-src/target}"

[ -x "$HOME/.cargo/bin/cargo" ] && export PATH="$HOME/.cargo/bin:$PATH"

cd "$SRC_DIR"

echo "==> Checking working tree is clean"
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: $SRC_DIR has uncommitted changes, aborting." >&2
  git status --short
  exit 1
fi
[ -d "$SRC_DIR/../Primerool/crates/thermo-core" ] || { echo "ERROR: ../Primerool (Primerool checkout) not found next to $SRC_DIR" >&2; exit 1; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Fast-forwarding $BRANCH from origin"
git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
COMMIT="$(git rev-parse --short HEAD)"
echo "==> Deploying $BRANCH @ $COMMIT (Primerool @ $(git -C ../Primerool rev-parse --short HEAD))"

echo "==> Building server (release)"
cargo build --release --bin thermool

echo "==> Building frontend"
(cd frontend && npm ci --no-audit --no-fund && npm run build)

mkdir -p "$LIVE_DIR/frontend"
if [ -e "$LIVE_DIR/thermool" ]; then
  echo "==> Backing up current live deployment -> $BACKUP_DIR"
  cp -a "$LIVE_DIR" "$BACKUP_DIR"
fi

echo "==> Installing new build"
cp "$CARGO_TARGET_DIR/release/thermool" "$LIVE_DIR/thermool.new"
mv "$LIVE_DIR/thermool.new" "$LIVE_DIR/thermool"
rm -rf "$LIVE_DIR/frontend/dist.new"
cp -a frontend/dist "$LIVE_DIR/frontend/dist.new"
rm -rf "$LIVE_DIR/frontend/dist"
mv "$LIVE_DIR/frontend/dist.new" "$LIVE_DIR/frontend/dist"

echo "==> Restarting $SERVICE"
systemctl --user restart "$SERVICE"

echo "==> Health-checking $HEALTH_URL"
for _ in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "==> Pruning old auto-backups (keeping newest $KEEP_BACKUPS)"
    { ls -1dt "$HOME"/Thermool.autobak.* 2>/dev/null || true; } | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf
    echo "==> Deploy OK: $COMMIT is live and healthy."
    exit 0
  fi
  sleep 1
done

echo "ERROR: health check failed." >&2
if [ -d "$BACKUP_DIR" ]; then
  echo "==> Rolling back to $BACKUP_DIR" >&2
  rm -rf "$LIVE_DIR"
  cp -a "$BACKUP_DIR" "$LIVE_DIR"
  systemctl --user restart "$SERVICE"
fi
exit 1
