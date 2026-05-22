# Background Service Worker

`background.js` is the Manifest V3 service worker. It coordinates settings and
native messaging.

## Constants

- `NATIVE_HOST`: `com.scraper_llm.host`
- `DEFAULT_SAVE_DIR`: empty string

`DEFAULT_SAVE_DIR` must stay empty so local paths are not committed. Users set
their own save directory from the popup.

## Messages

### `getSettings`

Reads `savePath` from `chrome.storage.local` and returns it to the popup. If no
path has been saved, it returns the empty default.

### `saveSettings`

Writes the popup-provided `savePath` to `chrome.storage.local`.

### `save`

Reads the configured save directory and sends a native message with:

- `action: "save"`
- `directory`
- `filename`
- `content`

If no directory is configured, it returns a user-facing error telling the user to
set a save directory in the popup.

If Chrome cannot reach the native host, it returns an error telling the user to
run `install_host.sh`.

## Service Worker Boundary

Keep the service worker thin. It should not parse page DOM, convert Markdown, or
write files directly. Scraping belongs in `content.js`; file writing belongs in
the native host.

## Verification Notes

Changes here need extension-level verification in Chrome:

1. Reload the unpacked extension.
2. Confirm the popup loads the saved path.
3. Update the save path.
4. Scrape a page.
5. Confirm success and error states still show useful text.
