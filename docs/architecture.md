# Architecture

Page Scraper is intentionally small. The extension code stays in browser files,
and the native host only writes files.

## Component Map

```text
manifest.json
  Declares MV3 metadata, permissions, popup, icons, and service worker.

popup.html / popup.js
  Provides the popup UI, loads/saves the local save path, injects the scraper,
  and reports user-facing status.

content.js
  Runs in the active tab after a user click. Extracts metadata, readable content,
  Markdown, filenames, and word count.

background.js
  Service worker. Handles popup messages, persists settings in
  chrome.storage.local, and relays save requests to the native host.

native-host/save_file.py
  Native messaging host. Receives a save message and writes a Markdown file to
  the requested local directory.

install_host.sh
  Registers the native messaging host for the current Chrome user.
```

## Message Flow

1. The popup queries the active tab.
2. The popup injects `content.js` with `chrome.scripting.executeScript`.
3. The injected script returns `{ content, filename, wordCount }`.
4. The popup sends `{ action: "save", content, filename }` to `background.js`.
5. The background worker reads `savePath` from `chrome.storage.local`.
6. The background worker sends a native message to `com.scraper_llm.host`.
7. The Python host creates the target directory if needed and writes the file.
8. Success or error returns through the same path to the popup status text.

## Boundaries

`content.js` owns page parsing and Markdown conversion. Do not move scraping
logic into the background worker or native host.

`background.js` owns extension-level coordination and persistence. Keep it as a
thin message relay unless Chrome extension behavior requires otherwise.

`native-host/save_file.py` owns local file writing only. It must not parse web
pages, execute commands from extension messages, or send data over the network.

## No Build Step

Chrome loads the source files directly. Do not add a bundler, transpiler, package
manager dependency, or generated output unless the project clearly needs it and
the docs explain the new workflow.
