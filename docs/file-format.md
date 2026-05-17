# File format

## Schema — v1 (current)

```json
{
  "version": 1,
  "strokes": [
    {
      "color": "#222222",          // CSS color string, used as the path's fill
      "renderMode": "catmull",     // "catmull" | "quadratic"
      "samples": [
        { "x": 100, "y": 200, "w": 12 },
        { "x": 102, "y": 201, "w": 12 }
      ]
    }
  ]
}
```

### Top-level

- **`version`** (integer) — Must equal `1`. Loaders must reject any unknown
  version with a clear error. When the format changes incompatibly, bump the
  integer and add a migration step in `migrate()` (`src/main.ts`) that converts
  the older shape to the newest in-memory representation.
- **`strokes`** (array of [Stroke](#stroke)) — Drawing order = array order;
  later strokes render on top.

### Stroke

- **`color`** (string) — Any valid CSS color. Applied as the SVG `fill` of the
  ribbon path.
- **`renderMode`** (`"catmull"` | `"quadratic"`) — Chooses the smoothing
  algorithm. `catmull` makes the curve pass through every sample; `quadratic`
  makes it pass through midpoints with samples as control points.
- **`samples`** (array of [Sample](#sample)) — One entry per recorded point
  along the stroke centerline. Minimum 1.

### Sample

- **`x`**, **`y`** (number) — Canvas-space coordinates in pixels (origin
  top-left).
- **`w`** (number) — Per-sample stroke width in pixels. Variable widths along
  the path produce the variable-thickness ribbon.
