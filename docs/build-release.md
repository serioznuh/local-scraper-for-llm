# Build And Release

Page Scraper has no build step. Chrome loads the checked-in source files directly
as an unpacked extension.

## Local Checks

Run:

```bash
npm run check
```

The script checks:

- JavaScript syntax for extension scripts
- `manifest.json` JSON validity
- Python native host compilation without bytecode writes
- focused JavaScript and Python unit tests
- installer shell syntax
- Git whitespace issues in unstaged and staged diffs

## Versioning

`manifest.json` is the release version source for the extension. Bump it for
functional behavior, permission, storage, native-host, output-format, install, or
compatibility changes based on user impact. Cosmetic UI polish can stay on the
current version when it does not change those behavior contracts.

Do not bump the version for docs-only changes unless the user explicitly wants a
documentation release tag.

## Release Checklist

For user-visible behavior changes:

1. Update the relevant topic docs.
2. Update [history.md](history.md) and the dated archive.
3. Bump `manifest.json`.
4. Run `npm run check`.
5. Run focused scraper fixtures when scraper behavior changes.
6. Reload the unpacked extension in Chrome when runtime files changed.
7. Manually verify the affected extension flow.
8. Inspect the diff for private data.
9. Commit, push a branch, open a ready PR, merge after verification, push `main`,
   and clean up the branch unless the user asks to keep the PR open.

## Documentation Changes

Docs-only changes should not modify code unless the user approves the code change.
Still run `npm run check` before claiming completion because it is the project
gate.

## Branches And PRs

Use focused feature branches for meaningful changes. PRs are the default tracking
artifact and are not a manual approval gate unless the user asks to pause before
merge.

After successful verification, merge the PR, push `main`, delete the merged
branch on GitHub and locally, and prune stale remote-tracking refs.
