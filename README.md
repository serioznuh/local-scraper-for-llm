# Page Scraper

A Chrome extension that scrapes articles, job descriptions, recipes, Reddit posts, and event pages into clean Markdown files — saved directly to a configurable local directory for LLM analysis pipelines.

## Features

- **Smart content detection** — finds the main article node using semantic selectors + text-density scoring; ignores sidebars, navbars, and responsive duplicates
- **HTML → Markdown conversion** — headings, bold/italic, lists (nested), blockquotes, code blocks, links, and images
- **Image support** — preserves `<img>` tags as Markdown image links; handles lazy-loaded images (`data-src`) and resolves relative URLs
- **Rich metadata extraction** — title, author, and source URL extracted from JSON-LD (supports `author`, `organizer`, `publisher`), meta tags, and DOM fallbacks
- **Custom save path** — files go to any directory on disk (not Chrome's Downloads folder) via a native messaging host
- **Configurable from popup** — save directory editable at any time; no need to touch code
- **Date-prefixed filenames** — `2026-03-09_article-title.md` prevents collisions
- **Noise filtering** — removes ads, cookie banners, nav elements, and hidden responsive clones
- **Reddit-aware extraction** — preserves self-post bodies, removes Reddit UI noise, and exports comment threads in readable Markdown

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

Then **fully quit and relaunch Chrome** (Cmd+Q, not just closing the window).

> **Requirements:** Python 3 must be available at `/usr/bin/env python3`

### 3. Set your save directory

Click the extension icon → enter your desired path in the **Save directory** field → click **Update Path**.

The default path is pre-configured in `background.js` (`DEFAULT_SAVE_DIR`).

## Output format

```
--- DOCUMENT METADATA ---
TITLE: Article Title
AUTHOR: Author Name
SOURCE: https://example.com/article
--- END METADATA ---

Content in clean Markdown...

![Image alt text](https://example.com/image.png)
```

## Project structure

```
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

## Version history

| Version | Changes |
|---------|---------|
| 2.4.0 | Rebranded extension to Page Scraper; improved Reddit extraction for self-posts and comments across shadow DOM; removed Reddit UI noise; exported comment threads as clean Markdown |
| 2.2.1 | Fixed filename slug for non-Latin titles (Cyrillic, CJK, etc.) — uses Unicode-aware regex |
| 2.2.0 | Image support — `<img>` preserved as Markdown links |
| 2.1.0 | Fixed content duplication on responsive pages; sidebar exclusion via drill-down; improved author extraction (JSON-LD organizer/publisher) |
| 2.0.0 | Custom save path via native messaging host; background service worker; configurable popup; date-prefixed filenames; better article detection |
| 1.5.1 | Original version |
