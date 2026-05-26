# Permissions And Privacy

Page Scraper should remain a least-privilege local extension.

## Manifest Permissions

| Permission | Why it is needed |
| ---------- | ---------------- |
| `activeTab` | Grants temporary access to the current tab after the user clicks the extension. |
| `scripting` | Injects `content.js` into the active tab. |
| `storage` | Stores local settings in `chrome.storage.local`. |
| `nativeMessaging` | Sends Markdown to the local Python host for file writing, clipboard actions, folder selection, and open-after-save. |

The manifest does not define broad `host_permissions`. Avoid adding them unless
the user explicitly needs always-on or site-wide behavior and the README explains
why.

## Page Access

The extension reads the active page DOM only after the user clicks the Page
Scraper toolbar icon. It can see page text, visible links, image URLs, and
metadata exposed in the DOM for that tab at that moment.

Scraped content can include private page data if the page itself contains it:
account names, private URLs, visible tokens, embedded secrets, comments, or other
user data. Treat generated Markdown as private by default.

## Cookies And Browser State

The extension does not request Chrome cookie permissions and does not read cookies
directly.

Because it runs in the active tab, it can scrape pages that the user is already
signed into and can extract content rendered from that signed-in session. That is
different from reading cookies, but it still means saved Markdown can contain
private account data.

## Network Behavior

The extension does not make network requests. Remote image URLs may appear in
Markdown only as copied links from the scraped page.

Do not add network calls or external services unless the user explicitly needs
them and the docs explain the data flow.

## Clipboard

When **Copy Markdown text** is enabled, the native host asks macOS to write the
full scraped Markdown to the system clipboard after saving. This replaces
whatever was previously on the clipboard.

When **Copy saved Markdown file** is enabled, the native host asks macOS to copy
the saved `.md` file as a file reference after writing it. App support varies:
file-aware local apps are more likely to accept the pasted file than web text
fields. Clipboard settings are off by default.

## Local Storage

`chrome.storage.local` stores a versioned local settings object with `savePath`,
`clipboardMode`, `openAfterSave`, `redditCommentScoreFilterEnabled`, and
`redditCommentMinScore`, and `redditTrivialCommentFilterEnabled`. Keep
`DEFAULT_SAVE_DIR` empty in committed code.

Do not commit local save paths or machine-specific runtime settings.

The Reddit comment score filter reads scores already exposed in the active
Reddit tab DOM. It does not add host permissions, Reddit API calls, cookie
access, or external network requests.

## Native Messaging Boundary

The native host receives:

- `action`
- `directory`
- `filename`
- `content`
- `clipboardMode`
- `openAfterSave`

It creates the directory if needed, validates the filename, and writes the file.
When `clipboardMode` is `markdown` on macOS, it copies Markdown text. When
`clipboardMode` is `file` on macOS, it asks the operating system to copy the
saved file. When `openAfterSave` is enabled on macOS, it asks the operating
system to open the saved file. It should not inspect page structure, execute
arbitrary commands, scrape websites, or transmit content elsewhere.

Generated filenames must remain path-safe. Scraped page content may influence the
filename slug, but it must not choose arbitrary directories or paths.

## Repository Hygiene

Do not commit private scrape outputs, screenshots, API keys, tokens, cookies,
browser profile data, or local fixtures. Keep manual outputs under ignored paths
such as `test-files-only-store-locally/`.
