# Verification

Use the lightest verification that proves the changed behavior, then report what
was and was not verified.

## Docs-Only Changes

Run:

```bash
npm run check
```

The lint script is intended to stay sandbox-friendly. It checks the Python
native host syntax in memory instead of writing `.pyc` bytecode cache files.

Also inspect the docs diff for private paths, scrape outputs, screenshots, API
keys, tokens, cookies, browser profile data, and accidental code changes.

## Scraper Behavior Changes

Before changing scraper behavior, create or run a focused fixture that fails on
the current behavior when feasible.

For Reddit comments, include delayed-hydration and virtualized-comment cases when
the behavior touches thread extraction. Comments can appear after the post body
and can unmount when scrolling back to the top.

After implementation:

1. Rerun the same fixture.
2. Run `npm run check`.
3. When possible, reload the unpacked extension and test one real page in Chrome.

## Action, Options, Background, And Native Host Changes

Reload the unpacked extension in Chrome and verify:

- toolbar icon scrape trigger works
- missing or unwritable save-directory errors open Settings automatically
- folder picker populates save directory
- save path and output-action settings update
- unsaved-changes top toast appears for edited settings and hides after saving
- settings save success appears as a temporary green top toast
- green success replaces the yellow unsaved-changes toast without a blank gap
- toolbar success, warning, and error badges are readable
- warning and non-settings error tooltips stay visible until the next scrape run
- Markdown text clipboard copy works when enabled
- saved-file clipboard copy works when enabled
- macOS open-after-save works when enabled
- native host returns success
- user-facing error text is actionable

## Manifest Or Permission Changes

Reload the unpacked extension and confirm Chrome accepts the manifest.

For permission changes, update README, AGENTS, current state, and
[permissions-and-privacy.md](permissions-and-privacy.md). Explain why the new
permission is needed and what data it can expose.

## Commands That Need Approval

Ask before:

- destructive Git operations
- force pushes
- broad permission expansion
- commands that may expose or modify private data
- deleting private local fixtures or scrape outputs

## GitHub PR Tracking

For meaningful changes, use a branch and PR even when the user does not intend to
manually approve the merge. Open a normal ready PR by default, not a draft PR,
unless the user asks for a draft.

The PR should summarize:

- what changed
- why it changed
- how it was checked
- any manual verification that could not be performed

After successful verification, merge and push `main` unless the user explicitly
asks to keep the PR open for review.
