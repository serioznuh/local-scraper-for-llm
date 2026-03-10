#!/bin/bash
# Install native messaging host for Page Scraper extension.
#
# Usage: ./install_host.sh <chrome-extension-id>
#
# To find your extension ID:
#   1. Open chrome://extensions
#   2. Enable "Developer mode" (toggle in top-right)
#   3. Find "Page Scraper" and copy the ID

set -e

if [ -z "$1" ]; then
    echo "Usage: ./install_host.sh <chrome-extension-id>"
    echo ""
    echo "Find your extension ID at chrome://extensions (enable Developer mode)"
    exit 1
fi

EXTENSION_ID="$1"
HOST_NAME="com.scraper_llm.host"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/native-host/save_file.py"
PYTHON_BIN="$(command -v python3 || true)"

if [ -z "$PYTHON_BIN" ] && [ -x /usr/bin/python3 ]; then
    PYTHON_BIN="/usr/bin/python3"
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "Python 3 not found."
    exit 1
fi

# Create a wrapper and a runtime copy of the host script at space-free paths
# outside Documents. Chrome-native processes can fail to execute files there
# due to macOS privacy restrictions.
WRAPPER_DIR="$HOME/.local/bin"
WRAPPER_SCRIPT="$WRAPPER_DIR/scraper-llm-native-host"
RUNTIME_DIR="$HOME/.local/share/scraper-llm-native-host"
RUNTIME_SCRIPT="$RUNTIME_DIR/save_file.py"

mkdir -p "$WRAPPER_DIR"
mkdir -p "$RUNTIME_DIR"

cp "$HOST_SCRIPT" "$RUNTIME_SCRIPT"
chmod +x "$RUNTIME_SCRIPT"

cat > "$WRAPPER_SCRIPT" << WRAPPER
#!/bin/bash
exec "$PYTHON_BIN" "$RUNTIME_SCRIPT"
WRAPPER
chmod +x "$WRAPPER_SCRIPT"
chmod +x "$HOST_SCRIPT"

# Determine manifest directory based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

mkdir -p "$MANIFEST_DIR"

# Write native messaging host manifest pointing to the wrapper
cat > "$MANIFEST_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "Native messaging host for Page Scraper extension",
  "path": "$WRAPPER_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo ""
echo "Native messaging host installed successfully."
echo ""
echo "  Host name:    $HOST_NAME"
echo "  Python:       $PYTHON_BIN"
echo "  Wrapper:      $WRAPPER_SCRIPT"
echo "  Runtime:      $RUNTIME_SCRIPT"
echo "  Source:       $HOST_SCRIPT"
echo "  Manifest:     $MANIFEST_DIR/$HOST_NAME.json"
echo "  Extension ID: $EXTENSION_ID"
echo ""
echo "Reload the extension in chrome://extensions, then you're ready to go."
