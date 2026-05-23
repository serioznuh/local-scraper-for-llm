# Page Scraper Agent Guide

This file is the first-stop guide for Codex or any other coding agent working in
this Chrome extension project. Read it before making changes.

## Purpose

Page Scraper is a Chrome Manifest V3 extension that extracts readable Markdown
from the active tab and saves it through a local native messaging host. Keep the
extension simple: there is no build step, and Chrome loads the source files
directly.

## Working Rules

- Work only inside this project unless the user explicitly asks for a
  cross-project change.
- Check `git status --short --branch` before editing.
- Use a focused feature branch and GitHub PR for meaningful changes.
- If the user asks for docs-only work, do not change code unless they approve it.
- Preserve unrelated user changes. Do not reset, overwrite, or clean files unless
  the user explicitly asks for that.
- Do not commit local save paths, private scraped outputs, screenshots, API keys,
  cookies, tokens, browser profile data, or private fixtures.
- Keep extension behavior, permissions, output format, install steps,
  verification, and docs in sync. If a change affects how the user loads, runs,
  configures, verifies, or trusts the extension, update the relevant docs in the
  same change.

## Current System

Read [docs/current-state.md](docs/current-state.md) for the active project state.

Core facts:

- Manifest V3 extension loaded directly from this repository.
- `content.js` extracts metadata, readable content, Markdown, and filenames.
- `settings.js` owns default settings, migration, normalization, and summaries.
- `background.js` handles toolbar-icon scraping, options messages, local
  settings, status badges, and native messaging.
- `options.html` and `options.js` provide save-path and output-action settings.
- `native-host/save_file.py` receives Markdown, writes files locally, and can
  copy or open saved Markdown files on macOS when the user enables those
  settings.
- `install_host.sh` registers the native host for the current Chrome user.
- `DEFAULT_SAVE_DIR` must stay empty. Users configure their own save path.

## Important Docs

- [docs/current-state.md](docs/current-state.md) - active behavior summary.
- [docs/architecture.md](docs/architecture.md) - component boundaries and flow.
- [docs/content-script.md](docs/content-script.md) - extraction and Markdown rules.
- [docs/background-service-worker.md](docs/background-service-worker.md) -
  service worker messages and native relay.
- [docs/action-options-ui-and-storage.md](docs/action-options-ui-and-storage.md) -
  toolbar action, options-page status, and `chrome.storage.local` behavior.
- [docs/native-host.md](docs/native-host.md) - local file-writing boundary.
- [docs/permissions-and-privacy.md](docs/permissions-and-privacy.md) -
  permissions, page access, and private data handling.
- [docs/build-release.md](docs/build-release.md) - build, release, and versioning.
- [docs/verification.md](docs/verification.md) - verification expectations.
- [docs/history.md](docs/history.md) - chronological history index and archives.

## Documentation Maintenance

Documentation should stay useful as working context, not become a dumping ground:

- Use `AGENTS.md` for operating rules, project boundaries, safety gates, and
  command expectations; keep deep behavior details in topic docs.
- Use `README.md` for human setup, common commands, extension loading, and
  high-level behavior only.
- Use `docs/current-state.md` for the current system snapshot, not changelog
  entries.
- Update only the owner doc for a behavior change.
- Use `docs/history.md` as a chronological index. Detailed history belongs in
  dated archive files under `docs/history/`, ordered oldest to latest.
- Treat 200 lines as a review trigger, not an automatic failure. Split or archive
  when a doc crosses its soft budget without a clear reason to stay whole.
- Soft budgets: `AGENTS.md` 180, `README.md` 220, `current-state.md` 180,
  `verification.md` 180, normal topic docs 150. Start a new history archive when
  the month changes or the current archive becomes hard to scan.

## Commands

Run commands from the project root.

Fast local verification:

```bash
npm run check
```

Do not add a build tool, dependency, host permission, broad tab access, network
call, or external service unless the user explicitly needs it and the docs explain
why.

## Verification Expectations

Before claiming docs-only or privacy changes are complete, run:

```bash
npm run check
```

For scraper behavior changes, add or run a focused fixture that fails on the old
behavior when feasible, then rerun it after the change. For Reddit comments,
include delayed-hydration and virtualized-comment cases when the behavior touches
thread extraction.

For toolbar action, options, background, native-host, `manifest.json`, or permission
changes, manually verify the extension flow in Chrome after reloading the
unpacked extension. Do not merge these changes until manual testing passes.

Do not claim a fix is complete without reporting what was verified and what could
not be verified.

## Scraper Rules

- Prefer targeted site-specific extraction over broad global cleanup when a site
  has unusual DOM structure.
- Preserve useful content and metadata; remove UI chrome, ads, avatars, buttons,
  cookie banners, and navigation noise.
- Reddit exports must keep self-post text, post date when available, comment
  author, comment date when available, deleted-author comments with visible
  bodies, and nested reply structure.
- Use date-only `YYYY-MM-DD` values for absolute Reddit timestamps.
- Do not export Reddit avatar/profile images.
- Keep AutoModerator/bot boilerplate filtered unless the user explicitly asks for
  it.
- For Reddit reply threads, Markdown should make parent/child relationships
  obvious to downstream LLM readers. Parallel replies under one parent should
  remain siblings.

## Privacy And Security

- Keep `DEFAULT_SAVE_DIR` empty.
- Keep `test-files-only-store-locally/` ignored. Use it only for local fixtures
  and manual scrape output.
- Preserve the least-privilege extension model. Do not add host permissions,
  broad tab access, cookie access, network calls, or external services unless the
  user explicitly needs them and the docs explain why.
- Preserve the native-host boundary: it receives Markdown, writes files locally,
  and may copy or open a saved Markdown file through macOS only when the matching
  setting is enabled. It must not scrape pages, execute arbitrary commands from
  messages, or send content over the network.
- Keep generated filenames path-safe. Do not allow scraped page content to choose
  arbitrary filesystem paths.
- Inspect the staged diff before commit and scan staged text for secrets.

## GitHub Workflow

Use GitHub PRs as the default tracking path. PRs are for visibility, diff review,
and follow-up questions; they are not a manual approval gate unless the user
explicitly asks to pause before merge. Open normal ready PRs by default, not draft
PRs, then merge and push `main` after successful verification unless the user asks
to keep the PR open.

1. Start from clean `main`.
2. Create a focused feature branch.
3. Make scoped changes with tests/docs.
4. Run verification.
5. Inspect `git diff` and `git status --short`.
6. Scan staged text for secrets before committing.
7. Commit with a clear message.
8. Push the branch and open a ready PR that explains what changed and how it was
   checked.
9. Merge to `main` after successful verification unless the user asked to keep
   the PR open for review.
10. Push updated `main`.
11. Delete the merged PR branch on GitHub and locally, then prune stale
    remote-tracking refs.

Keep long-lived branches limited to `main` unless the user explicitly asks for a
temporary branch to remain available. Squash-merged branches still need cleanup
even though their original commit hashes are not ancestors of `main`; confirm the
patch landed before deleting them.

This workflow does not override safety gates. Ask before destructive Git
operations, force pushes, broad permission changes, or any action that may expose
or modify private data.
