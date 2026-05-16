# Project notes for Claude

## Tech stack

- **Vite + TypeScript + direct SVG DOM.** No UI framework.
- Chosen because the app is canvas-first: most interactions are imperative
  pointer manipulation of SVG nodes, not declarative state-driven UI. React (or
  similar) would add ceremony without earning its weight here. If a sidebar or
  panel grows complex later, drop in a tiny reactive primitive (e.g.
  `@preact/signals-core`) without rewriting.

## Backlog

The backlog lives at @BACKLOG.md. Keep it in sync as work progresses:

- Move shipped items to **Done**.
- Add new ideas surfaced during conversation.
- Remove or revise items that no longer reflect the plan.
- Entries stay short and low-ceremony (one bullet, one sentence).

## Design preferences

- **Smooth over angular.** When implementing a new rendering or editing tool,
  default to smooth-curve representations (quadratic / cubic bezier,
  Catmull-Rom, spline interpolation) rather than straight-segment polylines.
  The visual quality compounds — every downstream tool inherits the smoothness.
  Angular output should be a conscious choice with a reason, not the default.
