# Architecture

Page Scraper is intentionally small. The extension code stays in browser files,
and the native host only writes files.

## Component Map

```text
manifest.json
  Declares MV3 metadata, permissions, toolbar action, icons, options page, and
  service worker.

options.html / options.js
  Provides durable settings for save directory and output actions.

settings.js
  Defines default settings, migration, normalization, and compact summaries.

content.js
  Runs in the active tab after a user click. Extracts metadata, readable content,
  Markdown, filenames, and word count.

background.js
  Service worker. Handles toolbar-icon scraping, options messages, status
  badges, settings persistence, save request validation, and native-host relay.

native-host/save_file.py
  Native messaging host. Receives a save message, writes a Markdown file to the
  requested local directory, can copy Markdown text or the saved file on macOS,
  can show the macOS folder picker, and can open saved files on macOS when
  enabled.

install_host.sh
  Registers the native messaging host for the current Chrome user.
```

## Message Flow

1. The user clicks the toolbar icon.
2. The background service worker loads normalized settings.
3. The worker opens Settings and shows an error badge if no save directory is
   configured.
4. The worker injects `content.js` with `chrome.scripting.executeScript`.
5. The injected script returns `{ content, filename, wordCount }`.
6. The background worker sends a native message to `com.scraper_llm.host`.
7. The Python host creates the target directory if needed, writes the file,
   copies Markdown text if `clipboardMode` is `markdown`, copies the file if
   `clipboardMode` is `file`, and opens it if `openAfterSave` is enabled.
8. Success, warning, or error returns through the toolbar badge and latest status
   stored for the options page.

## Boundaries

`content.js` owns page parsing and Markdown conversion. Do not move scraping
logic into the background worker or native host.

`background.js` owns extension-level coordination and persistence. Keep it as a
thin message relay unless Chrome extension behavior requires otherwise.

`settings.js` owns settings shape and migration. Keep settings validation
centralized there before adding new preferences.

`native-host/save_file.py` owns local file writing and explicit macOS saved-file
clipboard/open actions. It must not parse web pages, execute arbitrary commands
from extension messages, or send data over the network.

## No Build Step

Chrome loads the source files directly. Do not add a bundler, transpiler, package
manager dependency, or generated output unless the project clearly needs it and
the docs explain the new workflow.
