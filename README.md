# Page Scraper

Page Scraper is a Chrome Manifest V3 extension that extracts readable Markdown
from the active tab and saves it to a local folder through a native messaging
host.

It is built for lightweight LLM analysis workflows: no build step, no backend
service, and no network calls from the extension.

## What It Does

- Scrapes the page when you click the Page Scraper toolbar icon.
- Detects the main readable content and filters common page chrome.
- Converts HTML into Markdown with headings, lists, blockquotes, code blocks,
  links, and image links.
- Adds metadata for title, author, source URL, and published date when available.
- Saves Markdown to your configured local directory.
- Can copy Markdown text or the saved `.md` file to the clipboard after scraping
  when enabled in settings.
- Can open saved Markdown files on macOS after saving when enabled in settings.
- Includes focused handling for Reddit threads and LinkedIn job pages.

## Requirements

- macOS
- Google Chrome
- Python 3 available as `python3` or `/usr/bin/python3`
- Node/npm for local verification commands

## Installation

### 1. Load The Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Copy the extension ID shown on the extension card.

### 2. Install The Native Host

The native host lets Chrome write Markdown files outside the Downloads sandbox.

```bash
./install_host.sh <your-extension-id>
```

Then reload the extension in `chrome://extensions`. If Chrome still reports the
native host is missing, fully quit and relaunch Chrome with Cmd+Q.

The installer registers Chrome's native messaging manifest for the current user
and copies the Python host into `$HOME/.local/share/scraper-llm-native-host/`.

### 3. Configure Settings

Right-click the extension icon and choose **Options**, then set **Save
directory** before the first scrape. You can type the path or use the folder
button to choose a local folder. If you click the toolbar icon before this is
configured, Settings opens automatically.

Optional settings are off by default:

- **Clipboard after scrape** can stay off, copy Markdown text, or copy the saved
  `.md` file for apps that accept pasted files.
- **Open saved Markdown file** opens the generated `.md` file through macOS
  after saving.

No default save path is committed. You must configure your own path before the
first scrape.

## Usage

1. Open the page you want to save.
2. Click the Page Scraper extension icon.
3. Check the configured save directory, clipboard, or opened file based on your
   settings.

Generated filenames use the current date and a page-title slug, for example:

```text
2026-05-22_getting-the-most-out-of-codex.md
```

## Output Format

```markdown
--- DOCUMENT METADATA ---
TITLE: Article Title
AUTHOR: Author Name
PUBLISHED: 2026-03-09
SCRAPED_AT: 2026-05-26 12:34 UTC
SOURCE: https://example.com/article
--- END METADATA ---

Content in clean Markdown...

![Image alt text](https://example.com/image.png)
```

`PUBLISHED` appears only when the page exposes a usable timestamp. `AUTHOR`
falls back to `Unknown Author` when no author can be found. Reddit exports also
add subreddit, post score, and exported-comment count metadata when available.

## Supported Content

Works well on articles, blog posts, job descriptions, event pages, recipes,
Reddit posts, documentation pages, and LinkedIn job pages.

Reddit exports keep self-post text, post date when available, comment author,
comment date when useful, compact comment scores, OP flags, deleted-author
comments with visible bodies, removed/deleted context anchors when needed, and
nested reply structure. A Settings toggle can drop trivial low-score Reddit leaf
comments; it is off by default.

## Project Layout

```text
.
|-- AGENTS.md
|-- README.md
|-- manifest.json
|-- background.js
|-- content.js
|-- options.html
|-- options.js
|-- settings.js
|-- native-host/save_file.py
|-- install_host.sh
|-- icons/
`-- docs/
```

See [docs/architecture.md](docs/architecture.md) for the component map and
runtime message flow.

## Privacy And Permissions

- The extension runs only after a user click.
- It uses `activeTab`, not broad host permissions.
- It does not request Chrome cookie access.
- It does not make network requests.
- It stores local settings in `chrome.storage.local`.
- Scraped page content is passed to a local native host and written to disk.
- If Markdown clipboard copying is enabled, scraped Markdown replaces the current
  clipboard contents.
- If saved-file clipboard copying is enabled, the native host asks macOS to copy
  the generated `.md` file as a file reference.
- If open-after-save is enabled, the native host asks macOS to open the saved
  `.md` file with the default local app.
- Remote image URLs may appear as Markdown links copied from the page.
- Local scrape outputs and private fixtures belong in ignored directories such
  as `test-files-only-store-locally/`.

See [docs/permissions-and-privacy.md](docs/permissions-and-privacy.md) for the
full permission and data-boundary notes.

## Development

There is no build step. Chrome loads these source files directly as an unpacked
extension.

Run the dependency-free check suite before committing:

```bash
npm run check
```

The check script validates JavaScript syntax, `manifest.json`, Python native host
syntax without writing bytecode cache files, focused unit tests, installer shell
syntax, and Git whitespace.

## Change Workflow

Meaningful changes use short-lived feature branches and PRs. Codex-created PR
titles start with `[codex]` and include summary plus verification notes. After
successful verification, Codex may merge and return to `main` unless you ask it
to keep the PR open.

Safety-sensitive actions still require explicit approval before the action
itself, including destructive Git operations, force pushes, permission expansion,
or anything that could expose or modify private data.

## More Documentation

Agent-specific operating rules live in [AGENTS.md](AGENTS.md).

- [docs/current-state.md](docs/current-state.md) - active project state.
- [docs/architecture.md](docs/architecture.md) - component boundaries and flow.
- [docs/content-script.md](docs/content-script.md) - scraper behavior.
- [docs/background-service-worker.md](docs/background-service-worker.md) -
  background worker messages.
- [docs/action-options-ui-and-storage.md](docs/action-options-ui-and-storage.md) -
  toolbar action, options-page status, and local settings.
- [docs/native-host.md](docs/native-host.md) - native host installation and
  file writing.
- [docs/permissions-and-privacy.md](docs/permissions-and-privacy.md) -
  permission and data handling details.
- [docs/build-release.md](docs/build-release.md) - release workflow.
- [docs/verification.md](docs/verification.md) - verification tiers.
- [docs/future-improvements.md](docs/future-improvements.md) - improvement
  backlog and future feature notes.
- [docs/history.md](docs/history.md) - chronological history index.
