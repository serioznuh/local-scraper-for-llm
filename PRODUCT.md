# Product

## Register

product

## Users

The primary user is a technically comfortable macOS user saving web content for
local LLM analysis. They use the extension during active browsing, often as a
quick capture step before switching to another tool. They need the workflow to
feel direct, predictable, and private.

## Product Purpose

Page Scraper extracts readable Markdown from the active Chrome tab and saves it
locally through a native messaging host. Success means one deliberate click turns
a messy web page into a useful local Markdown file, without network calls,
surprising permissions, or unnecessary interface friction.

## Brand Personality

Quiet, precise, trustworthy. The product should feel like a focused utility:
small surface area, clear status, conservative defaults, and no decorative
behavior that distracts from capture.

## Anti-references

Avoid marketing-style extension surfaces, oversized panels, busy control
surfaces, decorative card stacks, aggressive color, playful animations, and
settings that compete with the direct toolbar capture flow. Avoid any interface
that makes local privacy or file-writing behavior feel ambiguous.

## Design Principles

- Keep capture task-first: one toolbar click scrapes, status stays concise, and
  settings remain one step away.
- Put durable preferences in a dedicated settings surface, not in the capture
  flow.
- Make local side effects explicit: saving, clipboard replacement, and opening
  files should be visible, configurable, and off by default.
- Preserve the least-privilege trust model unless a feature clearly earns a new
  permission.
- Favor native macOS utility patterns over custom visual invention.

## Accessibility & Inclusion

Target WCAG AA for contrast, visible focus, form labels, and status text. Do not
make hover-only controls. Respect reduced-motion preferences for any future
motion, and keep copy short enough for the extension's constrained surfaces.
