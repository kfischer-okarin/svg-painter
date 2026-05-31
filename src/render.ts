import type { SceneElement, Sample } from './painter';

// The subset of SVG <path> attributes a stroke renders to.
export type Path = { fill: string; d: string };

// Polymorphic over the scene: each element type renders to its own SVG shape.
// main.ts calls this once per element to reconcile the DOM.
export function renderElement(element: SceneElement): Path {
  switch (element.type) {
    case 'stroke':
      return { fill: element.color, d: pathData(element.samples) };
  }
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
