# Page Scraper

Page Scraper is a Chrome Manifest V3 extension that extracts readable Markdown
from the active tab and saves it to a local folder through a native messaging
host.

It is built for lightweight LLM analysis workflows: no build step, no backend
service, and no network calls from the extension.

## What It Does

- Scrapes the page only when you click **Scrape Page** in the popup.
- Detects the main readable content and filters common page chrome.
- Converts HTML into Markdown with headings, lists, blockquotes, code blocks,
  links, and image links.
- Adds metadata for title, author, source URL, and published date when available.
- Saves Markdown to your configured local directory.
- Includes focused handling for Reddit threads and LinkedIn job pages.

## Requirements

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

### 3. Set The Save Directory

Click the extension icon, enter your target folder in **Save directory**, then
click **Update Path**.

No default save path is committed. You must configure your own path before the
first scrape.

## Usage

1. Open the page you want to save.
2. Click the Page Scraper extension icon.
3. Click **Scrape Page**.
4. Check the configured save directory for the generated Markdown file.

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
SOURCE: https://example.com/article
--- END METADATA ---

Content in clean Markdown...

![Image alt text](https://example.com/image.png)
```

`PUBLISHED` appears only when the page exposes a usable timestamp. `AUTHOR`
falls back to `Unknown Author` when no author can be found.

## Supported Content

Works well on articles, blog posts, job descriptions, event pages, recipes,
Reddit posts, documentation pages, and LinkedIn job pages.

Reddit exports keep self-post text, post date when available, comment author,
comment date when available, deleted-author comments with visible bodies, and
nested reply structure.

## Project Layout

```text
.
|-- AGENTS.md
|-- README.md
|-- manifest.json
|-- background.js
|-- content.js
|-- popup.html
|-- popup.js
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
- It stores only the configured save directory in `chrome.storage.local`.
- Scraped page content is passed to a local native host and written to disk.
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
npm run lint
```

The check script validates JavaScript syntax, `manifest.json`, Python native host
syntax without writing bytecode cache files, installer shell syntax, and Git
whitespace.

## Change Workflow

Use feature branches and GitHub PRs for meaningful changes. PRs are the default
tracking artifact: they make the exact diff visible, keep history reviewable,
and provide a place for follow-up questions.

PRs are not a manual approval gate unless you explicitly ask Codex to keep one
open. After successful verification, Codex should open a ready PR, merge it,
push `main`, and clean up the feature branch by default.

Safety-sensitive actions still require explicit approval before the action
itself, including destructive Git operations, force pushes, permission expansion,
or anything that could expose or modify private data.

## More Documentation

- [docs/current-state.md](docs/current-state.md) - active project state.
- [docs/architecture.md](docs/architecture.md) - component boundaries and flow.
- [docs/content-script.md](docs/content-script.md) - scraper behavior.
- [docs/background-service-worker.md](docs/background-service-worker.md) -
  background worker messages.
- [docs/popup-options-ui-and-storage.md](docs/popup-options-ui-and-storage.md) -
  popup, options-page status, and local settings.
- [docs/native-host.md](docs/native-host.md) - native host installation and
  file writing.
- [docs/permissions-and-privacy.md](docs/permissions-and-privacy.md) -
  permission and data handling details.
- [docs/build-release.md](docs/build-release.md) - release workflow.
- [docs/verification.md](docs/verification.md) - verification tiers.
- [docs/future-improvements.md](docs/future-improvements.md) - improvement
  backlog and future feature notes.
- [docs/history.md](docs/history.md) - chronological history index.
