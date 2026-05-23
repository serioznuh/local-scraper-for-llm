# Background Service Worker

`background.js` is the Manifest V3 service worker. It coordinates toolbar-icon
scraping, settings, status badges, and native messaging.

## Constants

- `NATIVE_HOST`: `com.scraper_llm.host`
- `DEFAULT_SAVE_DIR`: empty string

`DEFAULT_SAVE_DIR` must stay empty so local paths are not committed. Users set
their own save directory from the options page.

## Messages

### Toolbar Icon Click

`chrome.action.onClicked` is the scrape trigger. The worker loads settings,
opens Settings if no save directory is configured, injects `content.js`, sends
the result to the native host, and reports progress through badge text.

### `getSettings`

Reads the versioned `settings` object from `chrome.storage.local`, normalizes it
through `settings.js`, migrates the legacy `savePath` key when present, and
returns the normalized settings and latest status.

### `saveSettings`

Merges the provided settings patch with defaults and writes the normalized
settings object to `chrome.storage.local`.

### `chooseDirectory`

Sends a fixed native message asking the macOS host to show a folder picker and
return the selected directory path.

## Native Save Payload

When toolbar scraping succeeds, the worker validates `content` and `filename`,
then sends a native message with:

- `action: "save"`
- `directory`
- `filename`
- `content`
- `clipboardMode`
- `openAfterSave`

If Chrome cannot reach the native host, it returns an error telling the user to
run `install_host.sh`.

## Service Worker Boundary

Keep the service worker thin. It should not parse page DOM, convert Markdown, or
write files directly. Scraping belongs in `content.js`; file writing belongs in
the native host.

## Verification Notes

Changes here need extension-level verification in Chrome:

1. Reload the unpacked extension.
2. Open Settings and update save path/output actions.
3. Confirm the folder picker can populate the save directory.
4. Click the toolbar icon to scrape a page.
5. Confirm badges, save, Markdown text clipboard copy, saved-file clipboard copy,
   open-after-save, and error states still show useful text.
