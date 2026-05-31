import { describe, it, expect } from 'vitest';
import { Painter } from './painter';

describe('a fresh painter', () => {
  it('has no rendered content', () => {
    const painter = new Painter();

    expect(painter.paths).toEqual([]);
  });
});

describe('the pen tool', () => {
  it('draws one path when you press and release at a point', () => {
    const painter = new Painter();

    painter.penDown({ x: 10, y: 20 });
    painter.penUp();

    expect(painter.paths).toHaveLength(1);
    expect(painter.paths[0].d).not.toBe('');
  });

  it('paints new strokes with the default colour', () => {
    const painter = new Painter();

    painter.penDown({ x: 10, y: 20 });
    painter.penUp();

    expect(painter.paths[0].fill).toBe('#222222');
  });
});
