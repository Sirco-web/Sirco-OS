#!/bin/bash
# Download v86 from GitHub archive instead of using git submodule
# This avoids SSL certificate issues in Docker/CI environments

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

V86_COMMIT="d39f1b47722e94a7b41207dbc68102b2218e32aa"
V86_URL="https://github.com/MercuryWorkshop/v86/archive/${V86_COMMIT}.tar.gz"
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

# Download and extract
echo "Downloading v86 from GitHub..."
curl -sL "$V86_URL" -o /tmp/v86.tar.gz

echo "Extracting v86..."
tar -xzf /tmp/v86.tar.gz -C "${PROJECT_ROOT}"

# Rename extracted directory to v86
mv "${PROJECT_ROOT}/v86-${V86_COMMIT}" "$V86_DIR"

# Clean up
rm /tmp/v86.tar.gz

echo "v86 downloaded successfully!"
ls -la "$V86_DIR" | head -10
