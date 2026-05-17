# Backlog

Low-ceremony list of ideas. Add freely; move to **Done** when shipped.

## Ideas

### Editing

- **Width interpolation across an interval** — select a range of samples on a stroke, set start/end width, interpolate across. Preferred over the brush for precision work.
- **Liquify / push-pull** — drag a region of an existing stroke to deform it locally, no handles.
- **Physics / Laplacian node drag** — phase-2 deformation mode that produces wave-form overshoot when pulling past the natural envelope (springs with stiffness, or constrained Laplacian editing). Current Gaussian-falloff drag only produces smooth dips, not waves.
- **Adaptive sample density** — subdivide samples when the stroke is stretched (long segments), decimate when compressed. Important once we add deformation tools that meaningfully change arc length.
- **Centripetal Catmull-Rom** — replace uniform parameterization with `sqrt(distance)`-weighted to eliminate occasional overshoot near sharp curvature.
- **Stroke transform** — once selected, rotate / scale / mirror (currently only move is supported).
- **Stroke smoothing** — fit raw samples to a curve at stroke-end (Catmull-Rom or similar), reducing sample count.
- **Snap separate paths together** — endpoints magnet to nearby endpoints of other strokes.

### Drawing

- **Live mirror while drawing** — toggle a vertical / horizontal axis; strokes mirror live as you draw.
- **Random permutations / blooming shapes** — generative brushes that emit petal/leaf/spike shapes along a stroke.
- **Brush-strength slider** — currently hardcoded `BRUSH_STRENGTH = 2`.

### Workflow

- **Save / load file format** — JSON serialization of strokes (color + samples). Lets us share repro data, version drawings, persist work across sessions.
- **Persistence** — autosave strokes to localStorage and restore on reload.
- **Layers** — group strokes; hide / lock / reorder.
- **Color palette** — quick-pick recent / favorite colors instead of opening the system picker.

### Polish

- **Brush cursor over toolbar** — currently flickers off when pointer crosses the toolbar.
- **Pen pressure curve** — current mapping is `pressure * 2 * baseWidth`; might benefit from a tunable curve.

## Done

- Vite + TS scaffold
- Pen tool with variable-width ribbon rendering
- Round caps on stroke ends
- Smoothed normals (no more crumpled rails on tight pointer wobble)
- Width brush (pen / width tool toggle, shift-drag to thin)
- Toolbar readable in dark mode
- Undo / redo with snapshot stack (`Cmd/Ctrl-Z`, `Cmd-Shift-Z` / `Ctrl-Y`, capped at 50)
- Undo / redo toolbar buttons with disabled state
- Select tool: click to select, drag to move, Delete to remove, dashed bbox overlay
- Node editing with Gaussian falloff: drag a handle and surrounding samples follow with arc-length-weighted influence (reuses brush slider for σ)
- Ribbon rendered with Catmull-Rom cubic bezier smoothing — curve passes through every sample, so node handles sit on the rendered line even after large deformations
- Coalesced pointer events captured for denser, more uniform pen sampling
