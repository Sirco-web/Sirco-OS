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

# Clone with git (disable SSL verification for Docker environments without ca-certificates)
echo "Cloning v86 from GitHub (HTTPS)..."
GIT_SSL_NO_VERIFY=true git clone --depth 1 "$V86_REPO" "$V86_DIR"

# Fetch the specific commit and checkout
cd "$V86_DIR"
GIT_SSL_NO_VERIFY=true git fetch --depth 1 origin "$V86_COMMIT"
git checkout "$V86_COMMIT"

# Build libv86.js using npm-based closure compiler (Java not available in Docker)
echo "Building libv86.js using npm closure-compiler..."
mkdir -p build

# Install google-closure-compiler (npm version, no Java needed)
npm install --no-save google-closure-compiler

# Build libv86.js using the same options as the Makefile
npx google-closure-compiler \
    --js_output_file build/libv86.js \
    --define=DEBUG=false \
    --generate_exports \
    --externs src/externs.js \
    --warning_level VERBOSE \
    --jscomp_error accessControls \
    --jscomp_error checkRegExp \
    --jscomp_error checkTypes \
    --jscomp_error checkVars \
    --jscomp_error conformanceViolations \
    --jscomp_error const \
    --jscomp_error constantProperty \
    --jscomp_error deprecated \
    --jscomp_error deprecatedAnnotations \
    --jscomp_error duplicateMessage \
    --jscomp_error es5Strict \
    --jscomp_error externsValidation \
    --jscomp_error globalThis \
    --jscomp_error invalidCasts \
    --jscomp_error misplacedTypeAnnotation \
    --jscomp_error missingProperties \
    --jscomp_error missingReturn \
    --jscomp_error msgDescriptions \
    --jscomp_error nonStandardJsDocs \
    --jscomp_error suspiciousCode \
    --jscomp_error strictModuleDepCheck \
    --jscomp_error typeInvalidation \
    --jscomp_error undefinedVars \
    --jscomp_error unknownDefines \
    --jscomp_error visibility \
    --use_types_for_optimization \
    --assume_function_wrapper \
    --summary_detail_level 3 \
    --language_in ECMASCRIPT_2020 \
    --language_out ECMASCRIPT_2020 \
    --compilation_level SIMPLE \
    --jscomp_off=missingProperties \
    --output_wrapper ';(function(){%output%}).call(this);' \
    --js src/const.js src/config.js src/io.js src/main.js src/lib.js src/buffer.js src/ide.js src/pci.js src/floppy.js src/memory.js src/dma.js src/pit.js src/vga.js src/ps2.js src/rtc.js src/uart.js src/acpi.js src/apic.js src/ioapic.js src/state.js src/ne2k.js src/sb16.js src/virtio.js src/virtio_console.js src/virtio_net.js src/virtio_balloon.js src/bus.js src/log.js src/cpu.js src/debug.js src/elf.js src/kernel.js \
    --js src/browser/screen.js src/browser/keyboard.js src/browser/mouse.js src/browser/speaker.js src/browser/serial.js src/browser/network.js src/browser/starter.js src/browser/worker_bus.js src/browser/dummy_screen.js src/browser/inbrowser_network.js src/browser/fake_network.js src/browser/wisp_network.js src/browser/fetch_network.js src/browser/print_stats.js src/browser/filestorage.js \
    --js lib/9p-filer.js lib/filesystem.js lib/jor1k.js lib/marshall.js

echo "libv86.js built successfully!"
ls -lh build/libv86.js

# Download pre-built v86.wasm (requires clang + rust which aren't available in Docker)
echo "Downloading pre-built v86.wasm..."
# Using the upstream v86 release which has pre-built wasm files
V86_RELEASE_URL="https://github.com/copy/v86/releases/download/latest/v86.wasm"
node -e "
const https = require('https');
const fs = require('fs');

function downloadFile(url, dest, callback) {
  const file = fs.createWriteStream(dest);
  https.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      downloadFile(res.headers.location, dest, callback);
    } else if (res.statusCode === 200) {
      res.pipe(file);
      file.on('finish', () => { file.close(callback); });
    } else {
      console.error('Download failed with status:', res.statusCode);
      process.exit(1);
    }
  }).on('error', (e) => { console.error('Download error:', e); process.exit(1); });
}

downloadFile('$V86_RELEASE_URL', 'build/v86.wasm', () => console.log('v86.wasm downloaded'));
"

# Also create dummy .o files so make doesn't try to build them
echo "Creating placeholder object files..."
touch build/softfloat.o
touch build/zstddeclib.o

echo "v86.wasm downloaded successfully!"
ls -lh build/v86.wasm

cd "$PROJECT_ROOT"

echo "v86 downloaded and built successfully!"
ls -la "$V86_DIR" | head -10
