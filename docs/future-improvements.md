# Future Improvements

This document captures improvement ideas that are not current behavior. Keep
items grouped by expected user value, and move details into focused specs before
implementation.

## Priority Order

1. Scraper accuracy
2. User experience
3. Expanding site coverage
4. Privacy and security
5. Maintainability and testing

## Scraper Accuracy

Small, safe candidates:

- Add fixture-based scraper tests for Reddit, LinkedIn jobs, a generic article,
  a documentation page, and one messy page with navigation or ad noise.
- Improve metadata parsing for JSON-LD shapes such as `@graph`, nested arrays,
  `mainEntity`, `NewsArticle`, and `BlogPosting`.
- Preserve inline Markdown inside list items. Current list conversion should not
  lose links, code, emphasis, or images that appear inside `li` elements.
- Normalize normal links to absolute URLs, not only image URLs.

Larger candidates:

- Split extraction into explicit phases: metadata parsing, content selection,
  cleanup, Markdown rendering, and post-processing.
- Add extraction quality scoring that warns when output is unusually short,
  mostly links, mostly repeated text, or still contains obvious UI chrome.

## User Experience

Small, safe candidates:

- Disable the scrape button while scraping and restore it afterward.
- Show the saved file path returned by the native host, not only the filename.
- Make setup errors more specific: missing save path, missing native host,
  unwritable directory, and pages Chrome cannot inject into.
- Store and show a local "last saved" status in the popup.

Larger candidates:

- Add an options page for save directory, output preferences, and future toggles.
- Add a preview step that shows title, source, word count, and extracted content
  before saving.

## Clipboard And Open-After-Save Options

These should be user-configurable settings, disabled by default unless the user
chooses otherwise.

- Add an option to copy the scraped Markdown to the clipboard after extraction.
  The popup flow can likely use `navigator.clipboard.writeText()` while the user
  gesture is active. If copying needs to happen outside the popup's active
  interaction, evaluate adding the `clipboardWrite` permission or an offscreen
  document path.
- Add an option to open the saved `.md` file after the native host writes it.
  Because files are written through native messaging rather than Chrome's
  download manager, the likely implementation is for the native host to open the
  saved path with the operating system's default app after a successful save.
- Avoid relying on `chrome.downloads.open()` for native-host saves. That API is
  designed for Chrome download items and requires downloads permissions plus a
  user gesture.
- Treat both toggles as privacy-sensitive UX settings. The UI should make clear
  that clipboard contents will be replaced and that opening a file may launch an
  external local app.

## Expanding Site Coverage

Small, safe candidates:

- Add targeted cleanup profiles for GitHub issues and discussions, Stack
  Overflow answers, documentation pages, Substack or Medium-like articles, and
  forum threads.
- Add lightweight page-type reporting so the popup can distinguish generic
  article, Reddit, LinkedIn job, docs page, forum, and other strategies.

Larger candidates:

- Create a site/profile registry instead of adding more special cases directly
  into `content.js`.
- Add optional extraction modes: article only, article plus comments, full
  visible page, and selection only.

## Privacy And Security

Small, safe candidates:

- Sanitize filenames again inside the native host, even though the content script
  already generates safe filenames.
- Validate save-message shape in the background worker before sending content to
  the native host.
- Add a max content size guard to prevent accidental huge saves or oversized
  native messages.

Larger candidates:

- Add an optional redaction pass for common sensitive patterns before saving.
- Add local-only extraction metadata such as extraction time and extension
  version.

## Maintainability And Testing

Small, safe candidates:

- Keep the no-build-step workflow, but consider injecting multiple plain JS files
  so `content.js` can be split into focused modules.
- Add sanitized public fixtures or private ignored fixtures for regression
  checks.
- Add focused tests for filename generation, date parsing, Markdown conversion,
  Reddit nesting, and LinkedIn cleanup.

Larger candidates:

- Introduce a small test harness that loads HTML fixtures in a browser-like DOM
  and compares Markdown snapshots.
- Define a stable internal extraction result before Markdown rendering, so
  content-selection bugs and rendering bugs are easier to separate.
