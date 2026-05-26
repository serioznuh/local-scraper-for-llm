# Content Script

`content.js` is the scraper. It runs in the active tab only after the user clicks
the toolbar icon and the background service worker injects it.

## Responsibilities

- Detect the page type.
- Extract title, author, published date, and source URL.
- Find the main readable content node.
- Convert HTML to Markdown.
- Apply site-specific cleanup where generic extraction is not enough.
- Generate a path-safe filename and word count.
- Return data to the background service worker.

## Metadata

Metadata comes from JSON-LD, meta tags, and DOM fallbacks. Supported structured
fields include author-like values from `author`, `organizer`, and `publisher`.

Published dates are normalized to date-only values when possible. The metadata
block omits `PUBLISHED` if no usable timestamp is found.

## Main Content Selection

Generic pages use semantic selectors such as article/main/content containers plus
text-density scoring. The scraper drills down when a large container mostly wraps
a stronger child content node.

Cleanup removes common page chrome, hidden responsive duplicates, ads, cookie
banners, nav, footer, aside, forms, buttons, and other low-value elements.

## Markdown Conversion

The converter handles headings, paragraphs, bold/italic, links, nested lists,
blockquotes, code blocks, preformatted text, and images.

Image handling preserves useful image links, supports lazy-loaded sources such as
`data-src`, resolves relative URLs, and filters likely avatar/profile images for
Reddit.

## Reddit Behavior

Reddit extraction uses shadow-DOM-aware traversal. It waits for hydration,
prompts comment loading by scrolling near the comments area, recognizes current
comment fallback markers, and can parse visible page text when Reddit exposes
comments through rendered text but not the normal Markdown walk. Text fallback
stops before the subreddit sidebar/community chrome when possible.

Exports keep:

- self-post text
- post date when available
- comment author
- comment date when available
- comment score when available on Reddit's structured comment elements
- deleted-author comments with visible bodies
- nested reply structure

Parallel replies under one parent remain siblings in Markdown. Structured reply
headings use `author → parent`; Markdown heading depth is still used as the
visual nesting signal, and replies deeper than that heading cap add a compact
depth marker such as `d4`. Absolute Reddit timestamps use `YYYY-MM-DD`.

When the optional Reddit comment score filter is enabled, a structured comment
is exported if its numeric score meets the configured minimum or if it is an
ancestor needed to understand a retained reply. Below-threshold and unknown-score
ancestors are labeled `context only`; unrelated low-score branches are dropped.
Unscored Markdown or visible-text comment fallbacks are skipped because they
cannot support reliable score filtering.

## LinkedIn Job Behavior

LinkedIn job pages use targeted selectors for the job title, company, header
signals, and description. Cleanup removes Premium prompts, recommendation blocks,
similar jobs, and unrelated LinkedIn chrome when possible.

## Failure Shape

If no article node can be found, the script returns an error object. The
background service worker turns that into a persistent toolbar error badge and
tooltip until the next scrape run.
