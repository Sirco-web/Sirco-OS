#!/bin/bash
# Download Scram-aurora browser static files for Sirco-OS
# This downloads the actual browser files from the Scram-aurora repository

set -e

SCRAM_REPO="https://raw.githubusercontent.com/Sirco-web/Scram-aurora/main/public"
BROWSER_DIR="public"
EXTERNAL_SERVER="https://browser-app.is-a.lol"
WISP_URL="wss://browser-app.is-a.lol/wisp/"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOWNLOAD_SCRIPT="$SCRIPT_DIR/download-file.cjs"

echo "=== Downloading Scram-aurora browser files ==="

# Create directory if needed
mkdir -p "$BROWSER_DIR"

# Download browser files using Node.js script (curl may not be available)
echo "Downloading browser.html..."
node "$DOWNLOAD_SCRIPT" "$SCRAM_REPO/index.html" "$BROWSER_DIR/browser.html"

echo "Downloading browser.css..."
node "$DOWNLOAD_SCRIPT" "$SCRAM_REPO/browser.css" "$BROWSER_DIR/browser.css"

echo "Downloading browser.js..."
node "$DOWNLOAD_SCRIPT" "$SCRAM_REPO/browser.js" "$BROWSER_DIR/browser.js"

# Note: Sirco-OS uses anura-sw.js for service worker, so we don't need
# register-sw.js or sw.js from Scram-aurora

# Modify browser.js to use external wisp server and external Scramjet
echo "Configuring external URLs..."

# Update wisp URL
sed -i 's|const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";|const wispUrl = "'"$WISP_URL"'";|g' "$BROWSER_DIR/browser.js"

# Update Scramjet paths
sed -i "s|wasm: '/scram/scramjet.wasm.wasm'|wasm: '$EXTERNAL_SERVER/scram/scramjet.wasm.wasm'|g" "$BROWSER_DIR/browser.js"
sed -i "s|all: '/scram/scramjet.all.js'|all: '$EXTERNAL_SERVER/scram/scramjet.all.js'|g" "$BROWSER_DIR/browser.js"
sed -i "s|sync: '/scram/scramjet.sync.js'|sync: '$EXTERNAL_SERVER/scram/scramjet.sync.js'|g" "$BROWSER_DIR/browser.js"
sed -i "s|\"/epoxy/index.mjs\"|\"$EXTERNAL_SERVER/epoxy/index.mjs\"|g" "$BROWSER_DIR/browser.js"
sed -i "s|\"/baremux/worker.js\"|\"$EXTERNAL_SERVER/baremux/worker.js\"|g" "$BROWSER_DIR/browser.js"

# Update browser.html for external scripts and disable Turnstile
echo "Configuring browser.html for embedded use..."
sed -i 's|src="/scram/scramjet.all.js"|src="'"$EXTERNAL_SERVER"'/scram/scramjet.all.js"|g' "$BROWSER_DIR/browser.html"
sed -i 's|src="baremux/index.js"|src="'"$EXTERNAL_SERVER"'/baremux/index.js"|g' "$BROWSER_DIR/browser.html"
sed -i 's|src="epoxy/index.js"|src="'"$EXTERNAL_SERVER"'/epoxy/index.js"|g' "$BROWSER_DIR/browser.html"
sed -i 's|<div id="browser-ui" style="display: none;">|<div id="browser-ui">|g' "$BROWSER_DIR/browser.html"
sed -i 's|<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"|<!-- Turnstile disabled: <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"|g' "$BROWSER_DIR/browser.html"
# Remove register-sw.js reference since we use anura-sw.js
sed -i 's|<script src="register-sw.js" defer></script>|<!-- Sirco-OS uses anura-sw.js -->|g' "$BROWSER_DIR/browser.html"

# Update browser.js to use anura-sw.js instead of separate SW
echo "Configuring browser.js for Sirco-OS SW integration..."
sed -i 's|await navigator.serviceWorker.register.*sw.js.*);|// anura-sw.js already registered|g' "$BROWSER_DIR/browser.js"

echo "=== Scram-aurora browser files downloaded and configured ==="
echo "Files saved to: $BROWSER_DIR/"
echo "Wisp URL: $WISP_URL"
echo "External server: $EXTERNAL_SERVER"
ls -la "$BROWSER_DIR/browser."* 2>/dev/null || true
