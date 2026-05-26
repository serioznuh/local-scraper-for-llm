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

Core facts agents need before editing:

- Manifest V3 extension loaded directly from this repository; there is no build
  output or bundled runtime.
- Scraping, settings, background worker, options UI, native-host, privacy,
  release, and verification details each have an owner doc listed below.
- `DEFAULT_SAVE_DIR` must stay empty. Users configure their own save path.
- Permission expansion, destructive Git operations, force pushes, and
  private-data actions require explicit user approval.

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
- [docs/future-improvements.md](docs/future-improvements.md) - improvement backlog.
- [docs/history.md](docs/history.md) - chronological history index and archives.

## Documentation Ownership

When behavior changes, update the owner doc in the same change:

| Change area | Owner doc |
| --- | --- |
| Active runtime shape, supported behavior, settings, privacy state, project workflow | [docs/current-state.md](docs/current-state.md) |
| Component boundaries and message flow | [docs/architecture.md](docs/architecture.md) |
| Extraction, Markdown conversion, metadata, Reddit, LinkedIn behavior | [docs/content-script.md](docs/content-script.md) |
| Service worker messages, settings loading, badge/status behavior, native relay | [docs/background-service-worker.md](docs/background-service-worker.md) |
| Toolbar action, options UI, save-path state, output actions, `chrome.storage.local` | [docs/action-options-ui-and-storage.md](docs/action-options-ui-and-storage.md) |
| Native messaging install and local file-writing boundary | [docs/native-host.md](docs/native-host.md) |
| Permissions, page access, private data, local outputs, screenshots, fixtures | [docs/permissions-and-privacy.md](docs/permissions-and-privacy.md) |
| Build, release, versioning, extension packaging | [docs/build-release.md](docs/build-release.md) |
| Verification tiers, manual Chrome checks, PR verification notes | [docs/verification.md](docs/verification.md) |
| Future backlog and deferred feature notes | [docs/future-improvements.md](docs/future-improvements.md) |
| Chronological implementation history | [docs/history.md](docs/history.md) |

## Documentation Maintenance

Documentation should stay useful as working context, not become a dumping ground:

- `AGENTS.md` is the agent operating contract: boundaries, safety gates,
  commands, documentation ownership, scraper rules, privacy, and PR workflow.
- `README.md` is for human setup, common commands, extension loading, and
  high-level behavior.
- Use `docs/current-state.md` for the current system snapshot, not changelog
  entries.
- Update only the owner doc for a behavior change.
- Use `docs/history.md` as a chronological index. Detailed history belongs in
  dated archive files under `docs/history/`, ordered oldest to latest.
- Future agents should not run a separate documentation audit by default. They
  read this file automatically, update the owner doc listed above, and run
  `npm run check`. `tests/docs_contract.test.js` catches missing sections,
  broken local links, oversize docs, and history leaking into current-state docs.

Budget limits: `AGENTS.md` 180 lines, `README.md` 220, `current-state.md` 180,
`verification.md` 180, normal topic docs 150, history index 80, history archive 260.

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

Use GitHub PRs by default. PRs show the exact diff, keep history readable, and are
not a manual approval gate unless the user asks to pause before merge.

Default flow: branch from `main`, change, verify, inspect diff/status, scan secrets,
commit, push, open a ready `[codex]` PR, merge unless asked to keep it open, push
`main`, then delete the merged branch locally and remotely.

Keep long-lived branches limited to `main` unless the user asks for a temporary
branch to remain. Squash-merged branches still need cleanup; confirm the patch
landed before deleting.

This workflow does not override safety gates. Ask before destructive Git
operations, force pushes, broad permission changes, or private-data actions.
