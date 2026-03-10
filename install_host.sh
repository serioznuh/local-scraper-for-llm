#!/bin/bash
# Install native messaging host for Local Scraper for LLM extension.
#
# Usage: ./install_host.sh <chrome-extension-id>
#
# To find your extension ID:
#   1. Open chrome://extensions
#   2. Enable "Developer mode" (toggle in top-right)
#   3. Find "Local Scraper for LLM" and copy the ID

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

# Create a wrapper script at a space-free path, since Chrome's native
# messaging cannot execute scripts whose path contains spaces.
WRAPPER_DIR="$HOME/.local/bin"
WRAPPER_SCRIPT="$WRAPPER_DIR/scraper-llm-native-host"

mkdir -p "$WRAPPER_DIR"

cat > "$WRAPPER_SCRIPT" << WRAPPER
#!/bin/bash
exec /usr/bin/env python3 "$HOST_SCRIPT"
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
  "description": "Native messaging host for Local Scraper for LLM extension",
  "path": "$WRAPPER_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo ""
echo "Native messaging host installed successfully."
echo ""
echo "  Host name:    $HOST_NAME"
echo "  Wrapper:      $WRAPPER_SCRIPT"
echo "  Script:       $HOST_SCRIPT"
echo "  Manifest:     $MANIFEST_DIR/$HOST_NAME.json"
echo "  Extension ID: $EXTENSION_ID"
echo ""
echo "Reload the extension in chrome://extensions, then you're ready to go."
