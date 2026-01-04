#!/bin/bash
# Download v86 from GitHub using git clone (HTTPS)
# This avoids SSL certificate issues with git submodules in Docker/CI

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

V86_COMMIT="d39f1b47722e94a7b41207dbc68102b2218e32aa"
V86_REPO="https://github.com/MercuryWorkshop/v86.git"
V86_DIR="${PROJECT_ROOT}/v86"

echo "=== Downloading v86 ==="
echo "Commit: $V86_COMMIT"
echo "Target: $V86_DIR"

# Check if v86 directory already has content
if [ -d "$V86_DIR" ] && [ -f "$V86_DIR/Makefile" ]; then
    echo "v86 directory already exists and appears complete, skipping download"
    exit 0
fi

# Remove empty or incomplete v86 directory
if [ -d "$V86_DIR" ]; then
    echo "Removing incomplete v86 directory..."
    rm -rf "$V86_DIR"
fi

# Clone with git (HTTPS, no SSH = no cert issues)
echo "Cloning v86 from GitHub (HTTPS)..."
git clone --depth 1 "$V86_REPO" "$V86_DIR"

# Fetch the specific commit and checkout
cd "$V86_DIR"
git fetch --depth 1 origin "$V86_COMMIT"
git checkout "$V86_COMMIT"
cd "$PROJECT_ROOT"

echo "v86 downloaded successfully!"
ls -la "$V86_DIR" | head -10
