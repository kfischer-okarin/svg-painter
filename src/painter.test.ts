import { describe, it, expect } from 'vitest';
import { Painter } from './painter';

describe('a fresh painter', () => {
  it('has an empty scene', () => {
    const painter = new Painter();

    expect(painter.elements).toEqual([]);
  });

  it('records new strokes in the default colour', () => {
    const painter = new Painter();

    painter.penDown({ x: 10, y: 20 });
    painter.penUp();

    expect(painter.elements[0].color).toBe('#222222');
  });
});

describe('the pen tool', () => {
  it('records one stroke with a sample at the pressed point', () => {
    const painter = new Painter();

    painter.penDown({ x: 10, y: 20 });
    painter.penUp();

    const els = painter.elements;
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ type: 'stroke' });
    expect(els[0].samples[0]).toMatchObject({ x: 10, y: 20 });
  });
});
