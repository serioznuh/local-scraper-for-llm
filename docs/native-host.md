# Native Host

The native host is the local file-writing bridge between Chrome and the user's
filesystem.

## Host Identity

- Host name: `com.scraper_llm.host`
- Source script: `native-host/save_file.py`
- Installer: `install_host.sh`

## Installation

Run:

```bash
./install_host.sh <your-extension-id>
```

The installer:

1. Finds Python 3.
2. Copies `native-host/save_file.py` to
   `$HOME/.local/share/scraper-llm-native-host/save_file.py`.
3. Creates a wrapper at `$HOME/.local/bin/scraper-llm-native-host`.
4. Writes Chrome's native messaging manifest for the current user.
5. Allows only the provided extension ID as an origin.

On macOS, the manifest is written under:

```text
$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/
```

On Linux, it is written under:

```text
$HOME/.config/google-chrome/NativeMessagingHosts/
```

## Message Protocol

Chrome native messaging uses a 4-byte length prefix followed by a JSON payload.

The save payload contains:

- `action`
- `directory`
- `filename`
- `content`

For `action: "save"`, the host creates the directory if needed and writes the
Markdown file using UTF-8.

## Boundary

The host must stay local and narrow. It should only receive Markdown and write a
file. It must not scrape pages, execute commands from messages, inspect browser
state, or send content over the network.

## Troubleshooting

If Chrome reports the native host is missing:

1. Confirm `install_host.sh` was run with the current extension ID.
2. Reload the unpacked extension in `chrome://extensions`.
3. Fully quit and relaunch Chrome with Cmd+Q on macOS.
4. Confirm Python 3 is available.

If saving fails, check that the configured save directory path is valid and
writable by the current user.
