#!/usr/bin/env bash
set -euo pipefail

# Apply a downloaded MCP client update while preserving local KB and config.
# Usage: ./update-client.sh <package-path> [install-dir]

PACKAGE_PATH="$1"
INSTALL_DIR="${2:-$(cd "$(dirname "$0")/.." && pwd)}"

log() {
  echo "[Updater] $1"
}

if [[ ! -f "$PACKAGE_PATH" ]]; then
  echo "Update package not found: $PACKAGE_PATH" >&2
  exit 1
fi

log "Waiting for parent process to release files..."
sleep 3

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log "Extracting update package to $TEMP_DIR..."
unzip -q "$PACKAGE_PATH" -d "$TEMP_DIR"

SOURCE_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d | tail -n 1)
if [[ "$SOURCE_DIR" == "$TEMP_DIR" ]]; then
  SOURCE_DIR="$TEMP_DIR"
fi

log "Source directory: $SOURCE_DIR"
log "Install directory: $INSTALL_DIR"

# Preserve local KB and config
PRESERVE=(
  "docs/kb/cases"
  ".env"
  "mcp.json"
  ".hana-license"
  ".hana-license-cache.json"
)

cd "$SOURCE_DIR"
find . -type f | while read -r rel; do
  rel="${rel#./}"
  should_preserve=false
  for p in "${PRESERVE[@]}"; do
    if [[ "$rel" == "$p"* ]]; then
      should_preserve=true
      break
    fi
  done

  if [[ "$should_preserve" == true ]]; then
    log "Preserving local file: $rel"
    continue
  fi

  dest="$INSTALL_DIR/$rel"
  mkdir -p "$(dirname "$dest")"
  cp -f "$rel" "$dest"
done

# Clean up update cache and pending flag
rm -rf "$INSTALL_DIR/.update-cache"
rm -f "$INSTALL_DIR/.pending-update.json"

log "Update applied successfully."

if [[ -f "$INSTALL_DIR/start.sh" ]]; then
  log "Restarting MCP..."
  cd "$INSTALL_DIR"
  nohup ./start.sh >/dev/null 2>&1 &
else
  log "start.sh not found; please restart the MCP manually."
fi
