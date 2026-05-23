# Action, Options UI, And Storage

The toolbar icon is the user's capture surface. The options page owns durable
preferences and save-directory fixes.

## Toolbar Action

Clicking the Page Scraper toolbar icon starts extraction for the active tab. The
extension does not define a popup. Immediate feedback uses the toolbar badge and
icon tooltip:

- `...` while scraping or saving
- `OK` for success, then clears
- `WARN` when the file saved but an optional output action failed
- `ERR` for setup, extraction, or save failures

Warnings and errors keep their badge and tooltip text until the next scrape run
or until settings are saved. Only save-directory errors open the options page
automatically. Users can also open Settings through Chrome's extension
**Options** entry.

Action tooltips include a blank spacer line after the extension-controlled text
so Chrome's site-access line reads as separate browser-provided context.

## Options UI

The options page stores:

- **Save directory**: required before scraping.
- **Clipboard after scrape**: off by default; can copy Markdown text or the saved
  `.md` file through the macOS native host.
- **Open saved Markdown file**: off by default; macOS-only native-host action.

The page has no idle "ready" text. Save-directory errors appear in a persistent
top banner because the user can fix them there. Stored scrape successes,
warnings, and non-settings errors do not replay on settings load. Successful
settings saves show a green top floating toast that dismisses itself.

When form values differ from the last saved settings, a yellow **Unsaved
changes** top floating toast appears using the same banner styling as settings
errors. It hides after the settings save succeeds or when the form returns to
the saved values.

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
7. Opens Settings if the native host reports that the save directory cannot be
   created or written.
8. Reports non-settings failures and optional copy/open failures through the
   toolbar badge and tooltip.

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
trigger, success/error/warning badges, persistent warning/error tooltips,
successful save, Markdown text clipboard copy, saved-file clipboard copy,
open-after-save, and user-facing error text.
