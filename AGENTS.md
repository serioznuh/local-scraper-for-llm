# AGENTS.md

## Project Overview

Page Scraper is a Chrome Manifest V3 extension that extracts readable Markdown from the active tab and saves it through a native messaging host. Keep the extension simple: there is no build step, and the browser loads these files directly.

## File Ownership

- `content.js`: DOM extraction, site-specific cleanup, metadata parsing, HTML-to-Markdown conversion.
- `background.js`: service worker, popup message handling, native messaging relay, saved settings.
- `popup.html` and `popup.js`: extension popup UI for save-path configuration and scrape trigger.
- `native-host/save_file.py`: local file writing only. Do not move scraping logic here.
- `README.md`: user-facing behavior, install steps, output format, supported sites, version history.
- `AGENTS.md`: Codex/project workflow rules.

## Documentation Rules

- Update `README.md` in the same change whenever output format, scraping behavior, installation steps, permissions, supported content types, or user-required steps change.
- Update the version history for user-visible behavior changes. Keep `manifest.json` version aligned with those releases.
- Update `AGENTS.md` when project workflow, verification expectations, or architecture boundaries change.
- If a change requires user action, finish the response with a clear "Next Steps" section. For extension code changes, that usually means reloading the unpacked extension and refreshing the target tab.

## Scraper Rules

- Prefer targeted site-specific extraction over broad global cleanup when a site has unusual DOM structure.
- Preserve useful content and metadata; remove UI chrome, ads, avatars, buttons, cookie banners, and navigation noise.
- Reddit exports must keep self-post text, post date when available, comment author, comment date when available, deleted-author comments with visible bodies, and nested reply structure. Use date-only `YYYY-MM-DD` values for absolute Reddit timestamps. Do not export Reddit avatar/profile images.
- Keep AutoModerator/bot boilerplate filtered unless the user explicitly asks for it.
- For Reddit reply threads, Markdown should make parent/child relationships obvious to downstream LLM readers. Parallel replies under one parent should remain siblings.

## Verification Rules

- Before changing scraper behavior, create or run a focused fixture that fails on the current behavior. For Reddit comments, include delayed-hydration and virtualized-comment cases because comments can appear after the post body and can unmount when scrolling back to the top.
- After implementation, rerun the same fixture and run `node --check content.js`.
- When possible, also test one real page manually in Chrome after reloading the unpacked extension.
- Do not claim a fix is complete without reporting what was verified and what could not be verified.

## Editing Constraints

- Keep edits scoped to the requested behavior. Avoid unrelated refactors.
- Do not commit local save paths or private scraped outputs.
- Do not add a build tool or dependency unless the project clearly needs it.
- Preserve the native-host boundary: the host writes files; it should not parse webpages.
