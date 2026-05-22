# Popup, Options UI, And Storage

The popup is the user's control surface for Page Scraper.

The extension does not currently ship a separate Chrome options page. Settings
live in the popup.

## UI Elements

- **Scrape Page** button: starts extraction for the active tab.
- **Status** text: reports ready, scraping, saving, saved, and error states.
- **Save directory** input: shows and edits the configured local output path.
- **Update Path** button: saves the current path to extension storage.

## Popup Flow

On load, `popup.js` asks `background.js` for settings and fills the save path
input.

When the user clicks **Update Path**, the popup trims the input and sends
`saveSettings`.

When the user clicks **Scrape Page**, the popup:

1. Queries the active tab.
2. Injects `content.js`.
3. Reads the returned scraper data.
4. Sends a `save` message to the background worker.
5. Shows the returned success or error state.

## Storage

The only stored key is `savePath` in `chrome.storage.local`.

Do not add more stored values unless the user-visible behavior needs them. If new
storage is added, update README, this doc, and the privacy docs in the same
change.

## Error Text

Popup errors are user-facing. Keep them direct and actionable:

- missing extracted content
- missing save directory
- missing native host
- Chrome injection/runtime errors

## Verification Notes

Popup changes need manual Chrome verification after reloading the unpacked
extension. Check save-path load/update, scrape trigger, successful save, and
user-facing error text.
