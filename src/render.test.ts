import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { renderElement, type Path } from './render';
import type { SceneElement } from './painter';

type Pixel = { r: number; g: number; b: number; a: number };

// Rasterise a Path (its fill + d) into a square canvas and probe pixels.
function rasterize(path: Path, size = 100) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path fill="${path.fill}" d="${path.d}"/></svg>`;
  const { pixels, width } = new Resvg(svg).render();
  return {
    getPixelAt(x: number, y: number): Pixel {
      const i = (y * width + x) * 4;
      return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] };
    },
  };
}

describe('renderElement', () => {
  it('renders a single-sample stroke as a filled dot of its width', () => {
    const stroke: SceneElement = {
      type: 'stroke',
      id: 1,
      color: '#ff0000',
      samples: [{ x: 50, y: 50, w: 20 }],
    };
    const raster = rasterize(renderElement(stroke));

    // the dot covers its centre (radius 10) in solid red...
    expect(raster.getPixelAt(50, 50)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    // ...but not a point well beyond its radius
    expect(raster.getPixelAt(50, 90).a).toBe(0);
  });
});
