import './style.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_WIDTH = 1;
const MAX_WIDTH = 200;
const BRUSH_STRENGTH = 2;
const SAMPLE_MIN_DIST = 1.5;
const MAX_HISTORY = 50;

type Tool = 'pen' | 'width' | 'select';
type Point = { x: number; y: number };
type Sample = Point & { w: number };
type Stroke = { color: string; samples: Sample[]; el: SVGPathElement };
type Snapshot = { color: string; samples: Sample[] }[];
type HandleHit = { stroke: Stroke; index: number };

const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const widthInput = document.getElementById('width') as HTMLInputElement;
const brushInput = document.getElementById('brush') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const toolPenBtn = document.getElementById('tool-pen') as HTMLButtonElement;
const toolWidthBtn = document.getElementById('tool-width') as HTMLButtonElement;
const toolSelectBtn = document.getElementById('tool-select') as HTMLButtonElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const brushCursor = document.getElementById('brush-cursor') as HTMLDivElement;
const selectionRect = document.getElementById('selection-rect') as HTMLDivElement;

const state = {
  tool: 'pen' as Tool,
  strokes: [] as Stroke[],
  current: null as Stroke | null,
  brushing: false,
  selected: null as Stroke | null,
  dragging: false,
  dragLast: null as Point | null,
  draggingNode: null as HandleHit | null,
  baseWidth: Number(widthInput.value),
  brushRadius: Number(brushInput.value),
  color: colorInput.value,
};

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
const handleByEl = new Map<SVGCircleElement, HandleHit>();
let handleGroup: SVGGElement | null = null;

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
  toolSelectBtn.addEventListener('click', () => setTool('select'));
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
  else if (state.tool === 'width') widthDown(e);
  else selectDown(e);
}

function onPointerMove(e: PointerEvent) {
  updateBrushCursor(e);
  if (state.tool === 'pen') penMove(e);
  else if (state.tool === 'width') widthMove(e);
  else selectMove(e);
}

function onPointerUp(e: PointerEvent) {
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  state.current = null;
  state.brushing = false;
  selectUp();
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
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if (e.key === 'p') setTool('pen');
  else if (e.key === 'w') setTool('width');
  else if (e.key === 's') setTool('select');
}

function setTool(t: Tool) {
  state.tool = t;
  toolPenBtn.classList.toggle('active', t === 'pen');
  toolWidthBtn.classList.toggle('active', t === 'width');
  toolSelectBtn.classList.toggle('active', t === 'select');
  svg.classList.toggle('tool-select', t === 'select');
  if (t !== 'width') brushCursor.style.display = 'none';
  if (t !== 'select') deselect();
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

function selectDown(e: PointerEvent) {
  const target = e.target;
  if (target instanceof SVGCircleElement) {
    const hit = handleByEl.get(target);
    if (hit) {
      selectStroke(hit.stroke);
      pushHistory();
      state.draggingNode = hit;
      svg.classList.add('dragging');
      return;
    }
  }
  if (target instanceof SVGPathElement) {
    const stroke = state.strokes.find((s) => s.el === target);
    if (stroke) {
      selectStroke(stroke);
      pushHistory();
      state.dragging = true;
      state.dragLast = canvasPoint(e);
      svg.classList.add('dragging');
      return;
    }
  }
  deselect();
}

function selectMove(e: PointerEvent) {
  if (state.draggingNode) {
    dragNode(state.draggingNode, canvasPoint(e));
    return;
  }
  if (state.dragging && state.selected && state.dragLast) {
    const now = canvasPoint(e);
    const dx = now.x - state.dragLast.x;
    const dy = now.y - state.dragLast.y;
    state.dragLast = now;
    translateStroke(state.selected, dx, dy);
    state.selected.el.setAttribute('d', strokeToPathD(state.selected));
    refreshHandlePositions(state.selected);
    updateSelectionRect();
  }
}

function selectUp() {
  state.dragging = false;
  state.dragLast = null;
  state.draggingNode = null;
  svg.classList.remove('dragging');
}

function selectStroke(stroke: Stroke) {
  if (state.selected === stroke) return;
  state.selected = stroke;
  buildHandles(stroke);
  updateSelectionRect();
}

function deselect() {
  if (!state.selected) return;
  state.selected = null;
  clearHandles();
  updateSelectionRect();
}

function dragNode(hit: HandleHit, p: Point) {
  const sample = hit.stroke.samples[hit.index];
  sample.x = p.x;
  sample.y = p.y;
  hit.stroke.el.setAttribute('d', strokeToPathD(hit.stroke));
  refreshHandlePositions(hit.stroke);
  updateSelectionRect();
}

function buildHandles(stroke: Stroke) {
  clearHandles();
  const g = ensureHandleGroup();
  for (let i = 0; i < stroke.samples.length; i++) {
    const s = stroke.samples[i];
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(s.x));
    c.setAttribute('cy', String(s.y));
    c.setAttribute('r', '4');
    c.setAttribute('fill', '#fff');
    c.setAttribute('stroke', '#0a84ff');
    c.setAttribute('stroke-width', '1.5');
    c.setAttribute('class', 'handle');
    g.appendChild(c);
    handleByEl.set(c, { stroke, index: i });
  }
}

function refreshHandlePositions(stroke: Stroke) {
  if (state.selected !== stroke || !handleGroup) return;
  const circles = handleGroup.children;
  if (circles.length !== stroke.samples.length) {
    buildHandles(stroke);
    return;
  }
  for (let i = 0; i < circles.length; i++) {
    const c = circles[i] as SVGCircleElement;
    c.setAttribute('cx', String(stroke.samples[i].x));
    c.setAttribute('cy', String(stroke.samples[i].y));
  }
}

function clearHandles() {
  handleByEl.clear();
  if (handleGroup) handleGroup.replaceChildren();
}

function ensureHandleGroup(): SVGGElement {
  if (handleGroup && handleGroup.isConnected) return handleGroup;
  handleGroup = document.createElementNS(SVG_NS, 'g');
  handleGroup.setAttribute('id', 'handles');
  svg.appendChild(handleGroup);
  return handleGroup;
}

function translateStroke(stroke: Stroke, dx: number, dy: number) {
  for (const s of stroke.samples) {
    s.x += dx;
    s.y += dy;
  }
}

function deleteSelected() {
  if (!state.selected) return;
  pushHistory();
  const i = state.strokes.indexOf(state.selected);
  if (i >= 0) state.strokes.splice(i, 1);
  state.selected.el.remove();
  deselect();
}

function updateSelectionRect() {
  if (!state.selected) {
    selectionRect.style.display = 'none';
    return;
  }
  const { minX, minY, maxX, maxY } = strokeBbox(state.selected);
  selectionRect.style.display = 'block';
  selectionRect.style.left = `${minX}px`;
  selectionRect.style.top = `${minY}px`;
  selectionRect.style.width = `${maxX - minX}px`;
  selectionRect.style.height = `${maxY - minY}px`;
}

function strokeBbox(stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of stroke.samples) {
    const r = s.w / 2;
    if (s.x - r < minX) minX = s.x - r;
    if (s.x + r > maxX) maxX = s.x + r;
    if (s.y - r < minY) minY = s.y - r;
    if (s.y + r > maxY) maxY = s.y + r;
  }
  return { minX, minY, maxX, maxY };
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
  deselect();
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
  deselect();
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
  clone.querySelector('#handles')?.remove();
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
