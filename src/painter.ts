export type Point = { x: number; y: number };
export type Sample = Point & { w: number };

type Stroke = { type: 'stroke'; id: number; color: string; samples: Sample[] };

// The raw, polymorphic scene the painter owns, in render order (last = top).
// More variants (handle, selectionFrame) join the union as the tools are built.
// Turning these into SVG is the renderer's job, not the painter's.
export type SceneElement = Stroke;

const DEFAULT_COLOR = '#222222';
const DEFAULT_BASE_WIDTH = 12;

export class Painter {
  private strokes: Stroke[] = [];
  private color = DEFAULT_COLOR;
  private baseWidth = DEFAULT_BASE_WIDTH;
  private nextId = 1;

  penDown(point: Point) {
    this.strokes.push({
      type: 'stroke',
      id: this.nextId++,
      color: this.color,
      samples: [this.sample(point)],
    });
  }

  penUp() {}

  get elements(): SceneElement[] {
    return [...this.strokes];
  }

  private sample(point: Point): Sample {
    return { x: point.x, y: point.y, w: this.baseWidth };
  }
}
