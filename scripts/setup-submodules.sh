#!/bin/bash
# Setup script for Sirco-OS submodules
# This script handles submodule initialization in environments with SSL certificate issues

set -e

echo "=== Sirco-OS Submodule Setup ==="

# Disable SSL verification if needed (for Docker/CI environments)
if [ "${DISABLE_SSL_VERIFY:-false}" = "true" ]; then
    echo "Disabling SSL verification..."
    git config --global http.sslVerify false
fi

# Function to clone submodule manually if git submodule update fails
clone_submodule() {
    local path=$1
    local url=$2
    local commit=$3
    
    echo "Setting up submodule: $path from $url"
    
    if [ -d "$path" ] && [ -d "$path/.git" ]; then
        echo "  Submodule $path already exists, updating..."
        cd "$path"
        git fetch origin
        if [ -n "$commit" ]; then
            git checkout "$commit"
        fi
        cd - > /dev/null
    elif [ -d "$path" ] && [ ! "$(ls -A $path)" ]; then
        # Empty directory
        rmdir "$path"
        echo "  Cloning $path..."
        git clone --depth 1 "$url" "$path"
    elif [ ! -d "$path" ]; then
        echo "  Cloning $path..."
        git clone --depth 1 "$url" "$path"
    else
        echo "  $path exists and is not empty"
    fi
}

# Try standard git submodule update first
echo "Attempting standard submodule update..."
if git submodule update --init --recursive --depth 1 2>/dev/null; then
    echo "Standard submodule update succeeded!"
else
    echo "Standard submodule update failed, trying manual approach..."
    
    # Note: v86 is handled separately by download-v86.sh
    # Clone other submodules manually
    clone_submodule "aboutproxy" "https://github.com/MercuryWorkshop/aboutproxy" ""
    clone_submodule "dreamlandjs" "https://github.com/mercuryworkshop/dreamlandjs" ""
    clone_submodule "chimerix" "https://github.com/MercuryWorkshop/chimerix.git" ""
    clone_submodule "native-file-system-adapter" "https://github.com/MercuryWorkshop/native-file-system-adapter/" ""
    clone_submodule "x86_image_wizard/epoxy" "https://github.com/MercuryWorkshop/epoxy-tls" ""
fi

# Re-enable SSL verification
if [ "${DISABLE_SSL_VERIFY:-false}" = "true" ]; then
    git config --global http.sslVerify true
fi

echo "=== Submodule setup complete ==="
