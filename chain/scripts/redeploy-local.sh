#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# redeploy-local.sh
#
# Wipes the Hardhat Ignition deployment journal for the local chain and
# redeploys both contracts so their addresses match what .env.local expects.
#
# Run this whenever you restart the Hardhat node — contract state is wiped
# on restart, but the addresses stay the same as long as you always deploy
# from Account 0 with nonce 0.
#
# Usage (from repo root):
#   cd chain && bash scripts/redeploy-local.sh
#
# Or from anywhere:
#   bash chain/scripts/redeploy-local.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAIN_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         CREDENCE — Local Chain Redeploy              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Wipe the Ignition deployment journal so it doesn't think contracts exist
JOURNAL_DIR="$CHAIN_DIR/ignition/deployments/chain-31337"
if [ -d "$JOURNAL_DIR" ]; then
  echo "► Removing stale Ignition journal at $JOURNAL_DIR"
  rm -rf "$JOURNAL_DIR"
fi

echo "► Deploying contracts to localhost:8545 ..."
echo "  (make sure 'npm run node' is already running in another terminal)"
echo ""

cd "$CHAIN_DIR"
npm run deploy:local

echo ""
echo "✔  Contracts deployed."
echo ""
echo "Expected addresses (same every time on a fresh Hardhat node):"
echo "  IssuerRegistry      : 0x5FbDB2315678afecb367f032d93F642f64180aa3"
echo "  CertificateRegistry : 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
echo ""
echo "These match the values in front/app-next/.env.example"
echo "Copy that file to front/app-next/.env.local if you haven't already."
echo ""
