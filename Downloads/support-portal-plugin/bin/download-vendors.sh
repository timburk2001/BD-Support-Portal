#!/usr/bin/env bash
# Downloads html2canvas 1.4.1 into assets/vendor/.
# Run once from the plugin root before activating the plugin.
set -euo pipefail

VENDOR_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/vendor"
TARGET="$VENDOR_DIR/html2canvas.min.js"

if [ -f "$TARGET" ]; then
  echo "✓ html2canvas already present at $TARGET"
  exit 0
fi

mkdir -p "$VENDOR_DIR"

# Try curl first, fall back to wget.
DL_URL="https://github.com/niklasvh/html2canvas/releases/download/v1.4.1/html2canvas.min.js"

if command -v curl &>/dev/null; then
  echo "Downloading html2canvas 1.4.1 via curl…"
  curl -fsSL "$DL_URL" -o "$TARGET"
elif command -v wget &>/dev/null; then
  echo "Downloading html2canvas 1.4.1 via wget…"
  wget -q "$DL_URL" -O "$TARGET"
else
  echo "ERROR: Neither curl nor wget found. Download manually from:"
  echo "  $DL_URL"
  echo "and place the file at: $TARGET"
  exit 1
fi

echo "✓ Saved to $TARGET"
echo "  $(wc -c < "$TARGET" | tr -d ' ') bytes"
