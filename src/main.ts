import './style.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = { x: number; y: number };
type Sample = Point & { w: number };
type Stroke = { color: string; samples: Sample[] };

const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const widthInput = document.getElementById('width') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;

const state = {
  current: null as Stroke | null,
  currentEl: null as SVGPathElement | null,
  baseWidth: Number(widthInput.value),
  color: colorInput.value,
};

main();

function main() {
  syncCanvasSize();
  window.addEventListener('resize', syncCanvasSize);

  widthInput.addEventListener('input', () => {
    state.baseWidth = Number(widthInput.value);
  });
  colorInput.addEventListener('input', () => {
    state.color = colorInput.value;
  });
  clearBtn.addEventListener('click', clearAll);
  exportBtn.addEventListener('click', exportSvg);

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
}

function onPointerDown(e: PointerEvent) {
  svg.setPointerCapture(e.pointerId);
  const stroke: Stroke = { color: state.color, samples: [sampleFromEvent(e)] };
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('fill', stroke.color);
  el.setAttribute('d', strokeToPathD(stroke));
  svg.appendChild(el);
  state.current = stroke;
  state.currentEl = el;
}

function onPointerMove(e: PointerEvent) {
  if (!state.current || !state.currentEl) return;
  const sample = sampleFromEvent(e);
  const last = state.current.samples[state.current.samples.length - 1];
  if (distance(last, sample) < 1.5) return;
  state.current.samples.push(sample);
  state.currentEl.setAttribute('d', strokeToPathD(state.current));
}

function onPointerUp(e: PointerEvent) {
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  state.current = null;
  state.currentEl = null;
}

function sampleFromEvent(e: PointerEvent): Sample {
  const rect = svg.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    w: effectiveWidth(e),
  };
}

function effectiveWidth(e: PointerEvent): number {
  // Pointer Events report pressure=0.5 for devices without pressure (mouse).
  // Use the slider width as-is for those; otherwise scale by pressure.
  const hasPressure = e.pointerType !== 'mouse' && e.pressure > 0 && e.pressure !== 0.5;
  return hasPressure ? state.baseWidth * e.pressure * 2 : state.baseWidth;
}

function strokeToPathD(stroke: Stroke): string {
  const { samples } = stroke;
  if (samples.length === 0) return '';
  if (samples.length === 1) return dotPath(samples[0]);
  return ribbonPath(samples);
}

function dotPath(s: Sample): string {
  const r = s.w / 2;
  return (
    `M ${s.x - r} ${s.y}` +
    ` A ${r} ${r} 0 1 0 ${s.x + r} ${s.y}` +
    ` A ${r} ${r} 0 1 0 ${s.x - r} ${s.y} Z`
  );
}

function ribbonPath(samples: Sample[]): string {
  const { left, right } = offsetRails(samples);
  const startR = samples[0].w / 2;
  const endR = samples[samples.length - 1].w / 2;
  const parts: string[] = [`M ${left[0].x} ${left[0].y}`];
  for (let i = 1; i < left.length; i++) parts.push(`L ${left[i].x} ${left[i].y}`);
  parts.push(`A ${endR} ${endR} 0 0 0 ${right[right.length - 1].x} ${right[right.length - 1].y}`);
  for (let i = right.length - 2; i >= 0; i--) parts.push(`L ${right[i].x} ${right[i].y}`);
  parts.push(`A ${startR} ${startR} 0 0 0 ${left[0].x} ${left[0].y}`);
  parts.push('Z');
  return parts.join(' ');
}

function offsetRails(samples: Sample[]): { left: Point[]; right: Point[] } {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[i - 1] ?? samples[i];
    const next = samples[i + 1] ?? samples[i];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const half = samples[i].w / 2;
    left.push({ x: samples[i].x + nx * half, y: samples[i].y + ny * half });
    right.push({ x: samples[i].x - nx * half, y: samples[i].y - ny * half });
  }
  return { left, right };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function syncCanvasSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
}

function clearAll() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function exportSvg() {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('id');
  clone.setAttribute('xmlns', SVG_NS);
  const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `painting-${Date.now()}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
