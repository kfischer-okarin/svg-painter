import './style.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_WIDTH = 1;
const MAX_WIDTH = 200;
const BRUSH_STRENGTH = 2;
const SAMPLE_MIN_DIST = 1.5;
const MAX_HISTORY = 50;

type Tool = 'pen' | 'width';
type Point = { x: number; y: number };
type Sample = Point & { w: number };
type Stroke = { color: string; samples: Sample[]; el: SVGPathElement };
type Snapshot = { color: string; samples: Sample[] }[];

const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const widthInput = document.getElementById('width') as HTMLInputElement;
const brushInput = document.getElementById('brush') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const toolPenBtn = document.getElementById('tool-pen') as HTMLButtonElement;
const toolWidthBtn = document.getElementById('tool-width') as HTMLButtonElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const brushCursor = document.getElementById('brush-cursor') as HTMLDivElement;

const state = {
  tool: 'pen' as Tool,
  strokes: [] as Stroke[],
  current: null as Stroke | null,
  brushing: false,
  baseWidth: Number(widthInput.value),
  brushRadius: Number(brushInput.value),
  color: colorInput.value,
};

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

main();

function main() {
  syncCanvasSize();
  window.addEventListener('resize', syncCanvasSize);

  widthInput.addEventListener('input', () => {
    state.baseWidth = Number(widthInput.value);
  });
  brushInput.addEventListener('input', () => {
    state.brushRadius = Number(brushInput.value);
  });
  colorInput.addEventListener('input', () => {
    state.color = colorInput.value;
  });
  clearBtn.addEventListener('click', clearAll);
  exportBtn.addEventListener('click', exportSvg);
  toolPenBtn.addEventListener('click', () => setTool('pen'));
  toolWidthBtn.addEventListener('click', () => setTool('width'));
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  document.addEventListener('keydown', onKeyDown);

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('pointerleave', () => {
    brushCursor.style.display = 'none';
  });
}

function onPointerDown(e: PointerEvent) {
  svg.setPointerCapture(e.pointerId);
  if (state.tool === 'pen') penDown(e);
  else widthDown(e);
}

function onPointerMove(e: PointerEvent) {
  updateBrushCursor(e);
  if (state.tool === 'pen') penMove(e);
  else widthMove(e);
}

function onPointerUp(e: PointerEvent) {
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  state.current = null;
  state.brushing = false;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key === 'p') setTool('pen');
  else if (e.key === 'w') setTool('width');
}

function setTool(t: Tool) {
  state.tool = t;
  toolPenBtn.classList.toggle('active', t === 'pen');
  toolWidthBtn.classList.toggle('active', t === 'width');
  if (t !== 'width') brushCursor.style.display = 'none';
}

function penDown(e: PointerEvent) {
  pushHistory();
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('fill', state.color);
  const stroke: Stroke = { color: state.color, samples: [sampleFromEvent(e)], el };
  el.setAttribute('d', strokeToPathD(stroke));
  svg.appendChild(el);
  state.strokes.push(stroke);
  state.current = stroke;
}

function penMove(e: PointerEvent) {
  if (!state.current) return;
  const stroke = state.current;
  const sample = sampleFromEvent(e);
  const last = stroke.samples[stroke.samples.length - 1];
  if (distance(last, sample) < SAMPLE_MIN_DIST) return;
  stroke.samples.push(sample);
  stroke.el.setAttribute('d', strokeToPathD(stroke));
}

function widthDown(e: PointerEvent) {
  pushHistory();
  state.brushing = true;
  applyBrush(canvasPoint(e), e.shiftKey);
}

function widthMove(e: PointerEvent) {
  if (!state.brushing) return;
  applyBrush(canvasPoint(e), e.shiftKey);
}

function applyBrush(p: Point, shrink: boolean) {
  const delta = shrink ? -BRUSH_STRENGTH : BRUSH_STRENGTH;
  for (const stroke of state.strokes) {
    let touched = false;
    for (const s of stroke.samples) {
      const d = distance(p, s);
      if (d > state.brushRadius) continue;
      const falloff = 1 - d / state.brushRadius;
      s.w = clamp(s.w + delta * falloff, MIN_WIDTH, MAX_WIDTH);
      touched = true;
    }
    if (touched) stroke.el.setAttribute('d', strokeToPathD(stroke));
  }
}

function updateBrushCursor(e: PointerEvent) {
  if (state.tool !== 'width') {
    brushCursor.style.display = 'none';
    return;
  }
  const size = state.brushRadius * 2;
  brushCursor.style.display = 'block';
  brushCursor.style.left = `${e.clientX}px`;
  brushCursor.style.top = `${e.clientY}px`;
  brushCursor.style.width = `${size}px`;
  brushCursor.style.height = `${size}px`;
}

function sampleFromEvent(e: PointerEvent): Sample {
  const { x, y } = canvasPoint(e);
  return { x, y, w: effectiveWidth(e) };
}

function canvasPoint(e: PointerEvent): Point {
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function effectiveWidth(e: PointerEvent): number {
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
  const normals = smoothedNormals(samples);
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < samples.length; i++) {
    const half = samples[i].w / 2;
    left.push({ x: samples[i].x + normals[i].x * half, y: samples[i].y + normals[i].y * half });
    right.push({ x: samples[i].x - normals[i].x * half, y: samples[i].y - normals[i].y * half });
  }
  return { left, right };
}

function smoothedNormals(samples: Sample[]): Point[] {
  const raw = rawNormals(samples);
  if (raw.length <= 2) return raw;
  const smoothed: Point[] = new Array(raw.length);
  smoothed[0] = raw[0];
  smoothed[raw.length - 1] = raw[raw.length - 1];
  for (let i = 1; i < raw.length - 1; i++) {
    const nx = raw[i - 1].x + raw[i].x + raw[i + 1].x;
    const ny = raw[i - 1].y + raw[i].y + raw[i + 1].y;
    const len = Math.hypot(nx, ny) || 1;
    smoothed[i] = { x: nx / len, y: ny / len };
  }
  return smoothed;
}

function rawNormals(samples: Sample[]): Point[] {
  const normals: Point[] = [];
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[i - 1] ?? samples[i];
    const next = samples[i + 1] ?? samples[i];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    normals.push({ x: -ty / len, y: tx / len });
  }
  return normals;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function syncCanvasSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
}

function clearAll() {
  pushHistory();
  state.strokes = [];
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function undo() {
  const snap = undoStack.pop();
  if (!snap) return;
  redoStack.push(snapshot());
  restore(snap);
  updateHistoryButtons();
}

function redo() {
  const snap = redoStack.pop();
  if (!snap) return;
  undoStack.push(snapshot());
  restore(snap);
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function snapshot(): Snapshot {
  return state.strokes.map((s) => ({
    color: s.color,
    samples: s.samples.map((p) => ({ x: p.x, y: p.y, w: p.w })),
  }));
}

function restore(snap: Snapshot) {
  state.strokes = [];
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (const data of snap) {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('fill', data.color);
    const stroke: Stroke = { color: data.color, samples: data.samples, el };
    el.setAttribute('d', strokeToPathD(stroke));
    svg.appendChild(el);
    state.strokes.push(stroke);
  }
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
