# Design

## Design System

Page Scraper uses a restrained product-utility interface. The design should feel
native to Chrome and macOS rather than branded or promotional.

## Color

- Primary action: calm blue, used only for the main save/settings action and
  focus.
- Secondary action: neutral gray, used for settings or supporting actions.
- Success: green status text.
- Error: red status text.
- Surfaces: lightly tinted near-white and soft gray neutrals. Avoid pure black
  and pure white when adding new surfaces.

## Typography

- Font stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Use compact product UI sizes. Labels and helper text should stay readable, but
  extension surfaces should not use hero-scale type.
- Prefer weight and spacing over large size jumps.

## Components

- Primary button: clear hover, focus-visible, disabled, and busy states.
- Secondary buttons and links: quieter than the primary action.
- Text inputs: full-width with visible labels.
- Toggles: use standard checkbox/toggle semantics with clear labels and short
  explanatory text when the action has side effects.
- Status messages: concise, color-coded, and text-readable without relying only
  on color.

## Layout

- Toolbar feedback should stay badge-based and concise.
- Settings belong in a dedicated options page when they are durable preferences.
- Avoid nested cards. Use simple sections, dividers, and grouped controls.
- Keep text within constrained extension surfaces without overflow or layout
  shift.

## Motion

- Use minimal state transitions only for hover/focus feedback.
- Do not animate layout.
- Respect reduced-motion preferences for any future motion.
