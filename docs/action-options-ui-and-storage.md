# Action, Options UI, And Storage

The toolbar icon is the user's capture surface. The options page owns durable
preferences and detailed status.

## Toolbar Action

Clicking the Page Scraper toolbar icon starts extraction for the active tab. The
extension does not define a popup. Immediate feedback uses the toolbar badge:

- `...` while scraping or saving
- `OK` for success
- `WARN` when the file saved but an optional output action failed
- `ERR` for setup, extraction, or save failures

Setup errors open the options page automatically. Users can also open Settings
through Chrome's extension **Options** entry.

## Options UI

The options page stores:

- **Save directory**: required before scraping.
- **Clipboard after scrape**: off by default; can copy Markdown text or the saved
  `.md` file through the macOS native host.
- **Open saved Markdown file**: off by default; macOS-only native-host action.

The page has no idle "ready" text. Save/settings errors appear in a top banner.
Successful settings saves show a green top banner that dismisses itself.

## Storage

Settings live in `chrome.storage.local` under the `settings` key:

```json
{
  "version": 1,
  "savePath": "",
  "clipboardMode": "off",
  "openAfterSave": false
}
```

`settings.js` owns defaults, normalization, migration, and action summaries. The
background worker migrates the legacy `savePath` key when it sees one.

## Toolbar Flow

When the user clicks the toolbar icon, the background service worker:

1. Loads normalized settings.
2. Opens Settings and shows an error badge if no save directory is configured.
3. Injects `content.js` into the active tab.
4. Sends the scrape result to the native host for saving.
5. Lets the native host copy Markdown text if `clipboardMode` is `markdown`.
6. Lets the native host copy the saved file if `clipboardMode` is `file`.
7. Reports save, optional copy, and open-after-save outcomes through the toolbar
   badge and latest status shown in Settings.

## Error Text

Action and options errors are user-facing. Keep them direct and actionable:

- missing save directory
- missing extracted content
- missing native host
- unwritable directory
- Markdown text clipboard permission failure
- saved-file clipboard failure
- macOS open-after-save failure
- Chrome injection/runtime errors

## Verification Notes

Action/options changes need manual Chrome verification after reloading the
unpacked extension. Check settings load/save, folder picker, toolbar scrape
trigger, success/error badges, successful save, Markdown text clipboard copy,
saved-file clipboard copy, open-after-save, and user-facing error text.
