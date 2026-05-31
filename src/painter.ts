import { renderStrokePath, type Path, type Point, type Sample } from './render';

type Stroke = { id: number; color: string; samples: Sample[] };
type PathView = { id: number } & Path;

const DEFAULT_COLOR = '#222222';
const DEFAULT_BASE_WIDTH = 12;

export class Painter {
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private color = DEFAULT_COLOR;
  private baseWidth = DEFAULT_BASE_WIDTH;
  private nextId = 1;

  penDown(point: Point) {
    const stroke: Stroke = {
      id: this.nextId++,
      color: this.color,
      samples: [this.sample(point)],
    };
    this.strokes.push(stroke);
    this.current = stroke;
  }

  penUp() {
    this.current = null;
  }

  get paths(): PathView[] {
    return this.strokes.map((s) => ({ id: s.id, ...renderStrokePath(s) }));
  }

  private sample(point: Point): Sample {
    return { x: point.x, y: point.y, w: this.baseWidth };
  }
}
