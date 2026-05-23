# Current State

This file describes the active state of Page Scraper now. It is not a changelog;
historical release notes live in [history.md](history.md).

## Runtime Shape

Page Scraper is a dependency-free Chrome Manifest V3 extension. Chrome loads the
repository files directly as an unpacked extension. There is no bundler, build
output, or packaged runtime artifact in the repository.

The extension runs on demand:

1. The user clicks the Page Scraper toolbar icon.
2. `background.js` loads settings and injects `content.js` into the active tab.
3. `content.js` extracts Markdown and returns it to the background worker.
4. `background.js` sends the Markdown and enabled output actions to the native
   messaging host.
5. `native-host/save_file.py` writes the file to the configured local directory
   and can copy Markdown text, copy the saved file, or open it through macOS when
   enabled.
6. The toolbar badge and tooltip report progress, success, warnings, and errors.
   Save-directory errors open Settings automatically.

## Active Behavior

The scraper extracts title, author, published date when available, source URL,
main readable content, links, and image links. It converts HTML to Markdown and
filters common navigation, advertising, cookie, responsive-duplicate, and UI
noise.

General article extraction uses semantic selectors and text-density scoring. Site
specific paths handle Reddit threads and LinkedIn job pages when their DOM needs
more targeted cleanup.

Generated Markdown begins with a metadata block:

```markdown
--- DOCUMENT METADATA ---
TITLE: Article Title
AUTHOR: Author Name
PUBLISHED: 2026-03-09
SOURCE: https://example.com/article
--- END METADATA ---
```

`PUBLISHED` is omitted when the page does not expose a timestamp. `AUTHOR` falls
back to `Unknown Author`.

## Reddit State

Reddit extraction keeps self-post bodies, post dates when available, comment
authors, comment dates when available, deleted-author comments with visible
bodies, and nested reply structure. Absolute Reddit timestamps are formatted as
date-only `YYYY-MM-DD` values.

The scraper waits for hydrated comments and prompts comment loading by scrolling
near the comment section. It avoids exporting Reddit avatar/profile images and
filters common AutoModerator/bot boilerplate.

## LinkedIn Job State

LinkedIn job extraction keeps the job title/company header and job description.
It removes Premium prompts, recommendation modules, similar jobs, and unrelated
LinkedIn chrome when possible.

## Configuration State

Settings live as a versioned `settings` object in `chrome.storage.local`.
Supported keys are `savePath`, `clipboardMode`, and `openAfterSave`. The
committed `DEFAULT_SAVE_DIR` in `background.js` must stay empty so local save
paths are not stored in the repository.

The extension has no popup. The toolbar icon is the scrape trigger. The options
page owns durable settings, folder selection, and save-directory error recovery.
It shows a yellow top floating toast when edited values differ from saved
settings. Successful settings saves use a green top floating toast; it appears
immediately when replacing the yellow unsaved-changes toast. Both optional output
actions are off by default.

## Privacy State

The extension uses `activeTab`, `scripting`, `storage`, and `nativeMessaging`.
It does not define broad `host_permissions`, does not request cookie access, and
does not make network requests.

Scraped content may contain sensitive page text, visible tokens, private URLs, or
other user data if those are present in the page DOM. Saved outputs and clipboard
contents must stay local and out of Git unless the user explicitly decides
otherwise.

## Project Workflow

Use branches and ready GitHub PRs for meaningful changes. PRs are visibility and
diff-review artifacts, not a manual approval gate unless the user explicitly asks
to keep a PR open. After successful verification, Codex should merge its own PRs,
push `main`, and clean up feature branches by default.
