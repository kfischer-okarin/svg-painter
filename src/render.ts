export type Point = { x: number; y: number };
export type Sample = Point & { w: number };

// The subset of SVG <path> attributes a stroke renders to.
export type Path = { fill: string; d: string };

type RenderableStroke = { color: string; samples: Sample[] };

export function renderStrokePath(stroke: RenderableStroke): Path {
  return { fill: stroke.color, d: pathData(stroke.samples) };
}

function pathData(samples: Sample[]): string {
  if (samples.length === 0) return '';
  return dotPath(samples[0]);
}

function dotPath(s: Sample): string {
  const r = s.w / 2;
  return (
    `M ${s.x - r} ${s.y}` +
    ` A ${r} ${r} 0 1 0 ${s.x + r} ${s.y}` +
    ` A ${r} ${r} 0 1 0 ${s.x - r} ${s.y} Z`
  );
}
