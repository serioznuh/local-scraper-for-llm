# Native Host

The native host is the local file-writing bridge between Chrome and the user's
filesystem. On macOS, it can also copy the saved Markdown file as a file
reference, copy Markdown text, show a folder picker, or open a saved file when
the user enables those settings.

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

Other operating systems are not a supported target for this project.

## Message Protocol

Chrome native messaging uses a 4-byte length prefix followed by a JSON payload.

The save payload contains:

- `action`
- `directory`
- `filename`
- `content`
- `clipboardMode`
- `openAfterSave`

For `action: "save"`, the host creates the directory if needed and writes the
Markdown file using UTF-8. It validates the filename again before writing so
scraped page content cannot choose arbitrary paths.

If `clipboardMode` is `file` and the host is running on macOS, the host runs a
fixed AppleScript command that asks macOS to copy the saved Markdown file as a
file reference. If `clipboardMode` is `markdown`, the host writes the scraped
Markdown text to the macOS clipboard with `pbcopy`. If `openAfterSave` is
`true`, the host runs the system `open` command on the saved Markdown file. The
response includes:

- `success`
- `path`
- `copiedText`
- `copiedFile`
- `opened`
- `errorCode: "saveDirectory"` when saving fails because the directory is
  missing, cannot be created, or cannot be written
- `copyTextError` when saving succeeded but copying Markdown text failed
- `copyFileError` when saving succeeded but copying the file failed
- `openError` when saving succeeded but opening failed

For `action: "chooseDirectory"`, the host runs a fixed AppleScript folder picker
and returns:

- `success`
- `directory`
- `error` when the picker fails or is canceled

## Boundary

The host must stay local and narrow. It should only receive Markdown, write a
file, optionally copy Markdown text or that exact saved file on macOS, optionally
show a folder picker, and optionally open that exact saved file on macOS. It must
not scrape pages, execute arbitrary commands from extension messages, inspect
browser state, or send content over the network.

## Troubleshooting

If Chrome reports the native host is missing:

1. Confirm `install_host.sh` was run with the current extension ID.
2. Reload the unpacked extension in `chrome://extensions`.
3. Fully quit and relaunch Chrome with Cmd+Q on macOS.
4. Confirm Python 3 is available.

If saving fails, check that the configured save directory path is valid and
writable by the current user.
