# Page Scraper

A Chrome extension that scrapes articles, job descriptions, recipes, Reddit posts, and event pages into clean Markdown files — saved directly to a configurable local directory for LLM analysis pipelines.

## Features

- **Smart content detection** — finds the main article node using semantic selectors + text-density scoring; ignores sidebars, navbars, and responsive duplicates
- **HTML → Markdown conversion** — headings, bold/italic, lists (nested), blockquotes, code blocks, links, and images
- **Image support** — preserves `<img>` tags as Markdown image links; handles lazy-loaded images (`data-src`) and resolves relative URLs
- **Rich metadata extraction** — title, author, published date, and source URL extracted from JSON-LD (supports `author`, `organizer`, `publisher`), meta tags, and DOM fallbacks
- **Custom save path** — files go to any directory on disk (not Chrome's Downloads folder) via a native messaging host
- **Configurable from popup** — save directory editable at any time; no need to touch code
- **Date-prefixed filenames** — `2026-03-09_article-title.md` prevents collisions
- **Noise filtering** — removes ads, cookie banners, nav elements, and hidden responsive clones
- **Reddit-aware extraction** — preserves self-post bodies, published timestamps, deleted-author comments with visible text, and nested comment threads while removing avatars and Reddit UI noise
- **LinkedIn job extraction** — keeps the job top card and description while skipping Premium prompts, similar jobs, and other LinkedIn chrome

## Installation

### 1. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Copy the **Extension ID** shown on the card

### 2. Install the native messaging host

The native host allows the extension to write files to any path on disk (bypassing Chrome's sandboxed Downloads folder).

```bash
./install_host.sh <your-extension-id>
```

Then reload the extension from `chrome://extensions`. If Chrome still reports that the native host is missing, **fully quit and relaunch Chrome** (Cmd+Q, not just closing the window).

The installer writes Chrome's native-messaging manifest under the current user's Chrome config directory and copies the Python runtime host to `$HOME/.local/share/scraper-llm-native-host/` so Chrome can execute it outside this project folder.

> **Requirements:** Python 3 must be available in your `PATH` or at `/usr/bin/python3`

### 3. Set your save directory

Click the extension icon → enter your desired path in the **Save directory** field → click **Update Path**.

No default local path is committed in the repo. You must set your own save directory in the popup before the first scrape.

## Output format

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

`PUBLISHED` is included when the source exposes a timestamp.

`AUTHOR` falls back to `Unknown Author` when no author can be found.

For Reddit threads, comments are exported as thread-aware Markdown:

```markdown
## Comments

### gaswalk · 2021-05-25

Top-level comment text.

#### Reply to gaswalk: Fuquar7 · 2021-05-25

Reply text.

#### Reply to gaswalk: KimchiMaker · 2021-05-25

Parallel reply text.
```

## Project structure

```
├── AGENTS.md              # Codex contributor rules and maintenance checklist
├── README.md              # User-facing install, behavior, privacy, and release notes
├── .gitignore             # Keeps local/private outputs out of git
├── package.json           # Dependency-free lint/check scripts
├── manifest.json          # Extension manifest (v3)
├── background.js          # Service worker — native messaging relay + settings
├── content.js             # Injected scraper — HTML → Markdown conversion
├── popup.html / popup.js  # Extension popup UI
├── icons/                 # Extension icons (16, 32, 48, 128px)
├── native-host/
│   └── save_file.py       # Native messaging host — writes .md files to disk
└── install_host.sh        # One-time setup script for native host registration
```

## Supported content types

Works well on: **articles**, **blog posts**, **job descriptions**, **event pages**, **recipes**, **Reddit posts**, **documentation pages**.

## Privacy and data handling

- The extension runs only when you click **Scrape Page**.
- The scraped page content is sent from the content script to the extension background worker, then to the local native host for file writing.
- The native host writes Markdown to the save directory you configured in the popup. It does not parse pages or send data anywhere.
- The extension stores only the configured save directory in `chrome.storage.local`.
- The extension does not make network requests. Remote image URLs can appear in Markdown only as links copied from the scraped page.
- This repository must not include local save paths, private scraped outputs, screenshots, API keys, or tokens. Local scrape fixtures belong under `test-files-only-store-locally/`, which is ignored by git.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `activeTab` | Allows scraping the current tab after the user clicks the extension |
| `scripting` | Injects `content.js` into the active tab |
| `storage` | Stores the configured save directory locally |
| `nativeMessaging` | Sends the Markdown file to the local Python host for saving |

## Development and verification

There is no build step. Chrome loads the source files directly as an unpacked extension.

Development checks require Node/npm and Python 3 on `PATH`.

Run the dependency-free check suite before committing:

```bash
npm run lint
```

That script checks JavaScript syntax, validates `manifest.json`, compiles the Python native host without writing bytecode, checks the installer shell syntax, and runs Git whitespace conflict checks.

For scraper behavior changes:

- Use a focused fixture or real page that exercises the changed behavior.
- For Reddit, cover delayed hydration, virtualized comments, deleted-author comments with visible bodies, timestamps, and nested replies.
- Reload the unpacked extension after changing `content.js`, `manifest.json`, permissions, popup files, or background behavior.
- Keep manual scrape outputs in `test-files-only-store-locally/` or another ignored/private directory.

## Maintenance expectations

- Keep this README current whenever behavior, output format, installation, permissions, or supported sites change.
- Keep AGENTS.md current whenever Codex/project workflow expectations change.
- For scraper behavior changes, verify with a focused fixture or real page before updating version history.
- After changes to `content.js`, `manifest.json`, or extension permissions, reload the unpacked extension in Chrome before testing manually.

## Version history

| Version | Changes |
|---------|---------|
| 2.6.3 | Formats Reddit post and comment timestamps as date-only values and reads post dates from Reddit post-level attributes |
| 2.6.2 | Keeps Reddit comments mounted during extraction after forced comment-section scrolling, fixing virtualized threads that exported as post-only Markdown |
| 2.6.1 | Waits for lazy-loaded Reddit comments before scraping so hydrated threads do not export as post-only Markdown |
| 2.6.0 | Added Reddit post/comment timestamps, nested reply-thread Markdown, deleted-author comment preservation, and avatar filtering; added Codex project guidance |
| 2.5.1 | Fixed Reddit comment extraction on hydrated thread pages; removed the committed local default save path |
| 2.5.0 | Added LinkedIn job-page extraction that targets the job description and strips Premium/recommendation noise |
| 2.4.0 | Improved Reddit extraction for self-posts and comments across shadow DOM; removed Reddit UI noise; exported comment threads as clean Markdown |
| 2.3.0 | Fixed Reddit post-body extraction via shadow DOM traversal and smarter drill-down; filtered AutoModerator-style bot replies |
| 2.2.1 | Fixed filename slug for non-Latin titles (Cyrillic, CJK, etc.) — uses Unicode-aware regex |
| 2.2.0 | Image support — `<img>` preserved as Markdown links |
| 2.1.0 | Fixed content duplication on responsive pages; sidebar exclusion via drill-down; improved author extraction (JSON-LD organizer/publisher) |
| 2.0.0 | Custom save path via native messaging host; background service worker; configurable popup; date-prefixed filenames; better article detection |
| 1.5.1 | Original version |
