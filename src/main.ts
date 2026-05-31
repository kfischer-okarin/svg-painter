import './style.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_WIDTH = 1;
const MAX_WIDTH = 200;
const BRUSH_STRENGTH = 2;
const SAMPLE_MIN_DIST = 1.5;
const MAX_HISTORY = 50;
const FILE_VERSION = 1;

type Tool = 'pen' | 'width' | 'select';
type RenderMode = 'catmull' | 'quadratic';
type Point = { x: number; y: number };
type Sample = Point & { w: number };
type Stroke = { color: string; samples: Sample[]; el: SVGPathElement; renderMode: RenderMode };
type Snapshot = { color: string; samples: Sample[]; renderMode: RenderMode }[];
type HandleHit = { stroke: Stroke; index: number };
type NodeDrag = {
  stroke: Stroke;
  index: number;
  origPositions: Point[];
  arcDists: number[];
  startPoint: Point;
};

const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const widthInput = document.getElementById('width') as HTMLInputElement;
const brushInput = document.getElementById('brush') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const loadBtn = document.getElementById('load') as HTMLButtonElement;
const toolPenBtn = document.getElementById('tool-pen') as HTMLButtonElement;
const toolWidthBtn = document.getElementById('tool-width') as HTMLButtonElement;
const toolSelectBtn = document.getElementById('tool-select') as HTMLButtonElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const brushCursor = document.getElementById('brush-cursor') as HTMLDivElement;
const selectionRect = document.getElementById('selection-rect') as HTMLDivElement;
const strokeOptions = document.getElementById('stroke-options') as HTMLDivElement;
const renderModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="render-mode"]');

const state = {
  tool: 'pen' as Tool,
  strokes: [] as Stroke[],
  current: null as Stroke | null,
  brushing: false,
  selected: null as Stroke | null,
  dragging: false,
  dragLast: null as Point | null,
  draggingNode: null as NodeDrag | null,
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
  saveBtn.addEventListener('click', saveFile);
  loadBtn.addEventListener('click', loadFile);
  toolPenBtn.addEventListener('click', () => setTool('pen'));
  toolWidthBtn.addEventListener('click', () => setTool('width'));
  toolSelectBtn.addEventListener('click', () => setTool('select'));
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  renderModeRadios.forEach((r) => r.addEventListener('change', onRenderModeChange));

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
  const stroke: Stroke = {
    color: state.color,
    samples: [sampleFromEvent(e)],
    el,
    renderMode: 'catmull',
  };
  el.setAttribute('d', strokeToPathD(stroke));
  svg.appendChild(el);
  state.strokes.push(stroke);
  state.current = stroke;
}

function penMove(e: PointerEvent) {
  if (!state.current) return;
  const stroke = state.current;
  const events = e.getCoalescedEvents?.() ?? [e];
  let changed = false;
  for (const ev of events.length > 0 ? events : [e]) {
    const sample = sampleFromEvent(ev);
    const last = stroke.samples[stroke.samples.length - 1];
    if (distance(last, sample) < SAMPLE_MIN_DIST) continue;
    stroke.samples.push(sample);
    changed = true;
  }
  if (changed) stroke.el.setAttribute('d', strokeToPathD(stroke));
}

function selectDown(e: PointerEvent) {
  const target = e.target;
  if (target instanceof SVGCircleElement) {
    const hit = handleByEl.get(target);
    if (hit) {
      selectStroke(hit.stroke);
      pushHistory();
      state.draggingNode = {
        stroke: hit.stroke,
        index: hit.index,
        origPositions: hit.stroke.samples.map((s) => ({ x: s.x, y: s.y })),
        arcDists: computeArcDistances(hit.stroke.samples, hit.index),
        startPoint: canvasPoint(e),
      };
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
  if (state.tool !== 'width') brushCursor.style.display = 'none';
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

function dragNode(drag: NodeDrag, p: Point) {
  const sigma = Math.max(1, state.brushRadius);
  const dx = p.x - drag.startPoint.x;
  const dy = p.y - drag.startPoint.y;
  for (let i = 0; i < drag.stroke.samples.length; i++) {
    const weight = Math.exp(-((drag.arcDists[i] / sigma) ** 2));
    drag.stroke.samples[i].x = drag.origPositions[i].x + dx * weight;
    drag.stroke.samples[i].y = drag.origPositions[i].y + dy * weight;
  }
  drag.stroke.el.setAttribute('d', strokeToPathD(drag.stroke));
  refreshHandlePositions(drag.stroke);
  updateSelectionRect();
}

function computeArcDistances(samples: Sample[], from: number): number[] {
  const N = samples.length;
  const dists = new Array<number>(N).fill(0);
  for (let j = from + 1; j < N; j++) {
    dists[j] = dists[j - 1] + distance(samples[j - 1], samples[j]);
  }
  for (let j = from - 1; j >= 0; j--) {
    dists[j] = dists[j + 1] + distance(samples[j + 1], samples[j]);
  }
  return dists;
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
  if (!handleGroup) {
    handleGroup = document.createElementNS(SVG_NS, 'g');
    handleGroup.setAttribute('id', 'handles');
  }
  // Re-append so handles stay above strokes drawn after the group was created;
  // appendChild moves an existing child to the end rather than duplicating it.
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
    strokeOptions.style.display = 'none';
    return;
  }
  const { minX, minY, maxX, maxY } = strokeBbox(state.selected);
  selectionRect.style.display = 'block';
  selectionRect.style.left = `${minX}px`;
  selectionRect.style.top = `${minY}px`;
  selectionRect.style.width = `${maxX - minX}px`;
  selectionRect.style.height = `${maxY - minY}px`;
  strokeOptions.style.display = 'flex';
  strokeOptions.style.left = `${minX}px`;
  strokeOptions.style.top = `${maxY + 8}px`;
  renderModeRadios.forEach((r) => {
    r.checked = r.value === state.selected!.renderMode;
  });
}

function onRenderModeChange(e: Event) {
  if (!state.selected) return;
  const value = (e.target as HTMLInputElement).value as RenderMode;
  if (state.selected.renderMode === value) return;
  pushHistory();
  state.selected.renderMode = value;
  state.selected.el.setAttribute('d', strokeToPathD(state.selected));
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
  const visible = state.tool === 'width' || state.draggingNode !== null;
  if (!visible) {
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
  return ribbonPath(stroke);
}

function dotPath(s: Sample): string {
  const r = s.w / 2;
  return (
    `M ${s.x - r} ${s.y}` +
    ` A ${r} ${r} 0 1 0 ${s.x + r} ${s.y}` +
    ` A ${r} ${r} 0 1 0 ${s.x - r} ${s.y} Z`
  );
}

function ribbonPath(stroke: Stroke): string {
  const samples = stroke.samples;
  const { left, right } = offsetRails(samples);
  const startR = samples[0].w / 2;
  const endR = samples[samples.length - 1].w / 2;
  const reversedRight = [...right].reverse();
  const smooth = stroke.renderMode === 'catmull' ? smoothRailCatmull : smoothRailQuadratic;
  const parts: string[] = [`M ${left[0].x} ${left[0].y}`];
  parts.push(smooth(left));
  parts.push(`A ${endR} ${endR} 0 0 0 ${right[right.length - 1].x} ${right[right.length - 1].y}`);
  parts.push(smooth(reversedRight));
  parts.push(`A ${startR} ${startR} 0 0 0 ${left[0].x} ${left[0].y}`);
  parts.push('Z');
  return parts.join(' ');
}

function smoothRailCatmull(pts: Point[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `L ${pts[1].x} ${pts[1].y}`;
  const cmds: string[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < n ? pts[i + 2] : pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    cmds.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
  }
  return cmds.join(' ');
}

function smoothRailQuadratic(pts: Point[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `L ${pts[1].x} ${pts[1].y}`;
  const cmds: string[] = [];
  const m0x = (pts[0].x + pts[1].x) / 2;
  const m0y = (pts[0].y + pts[1].y) / 2;
  cmds.push(`L ${m0x} ${m0y}`);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    cmds.push(`Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`);
  }
  cmds.push(`L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`);
  return cmds.join(' ');
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
    renderMode: s.renderMode,
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
    const stroke: Stroke = {
      color: data.color,
      samples: data.samples,
      el,
      renderMode: data.renderMode,
    };
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
  triggerDownload(
    new Blob([clone.outerHTML], { type: 'image/svg+xml' }),
    `painting-${Date.now()}.svg`,
  );
}

function saveFile() {
  const data = { version: FILE_VERSION, strokes: snapshot() };
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `painting-${Date.now()}.json`,
  );
}

function loadFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(loadFromText).catch(reportLoadError);
  });
  input.click();
}

function loadFromText(text: string) {
  try {
    const data = JSON.parse(text) as unknown;
    const snap = migrate(data);
    undoStack.length = 0;
    redoStack.length = 0;
    restore(snap);
    updateHistoryButtons();
  } catch (err) {
    reportLoadError(err);
  }
}

function migrate(data: unknown): Snapshot {
  if (!data || typeof data !== 'object') throw new Error('file is not a JSON object');
  const obj = data as { version?: unknown; strokes?: unknown };
  if (obj.version !== 1) throw new Error(`unsupported file version: ${String(obj.version)}`);
  if (!Array.isArray(obj.strokes)) throw new Error('strokes field is missing or not an array');
  return obj.strokes.map(parseStrokeV1);
}

function parseStrokeV1(s: unknown): Snapshot[number] {
  if (!s || typeof s !== 'object') throw new Error('stroke must be an object');
  const obj = s as { color?: unknown; renderMode?: unknown; samples?: unknown };
  if (typeof obj.color !== 'string') throw new Error('stroke.color must be a string');
  if (obj.renderMode !== 'catmull' && obj.renderMode !== 'quadratic') {
    throw new Error(`unknown renderMode: ${String(obj.renderMode)}`);
  }
  if (!Array.isArray(obj.samples)) throw new Error('stroke.samples must be an array');
  return {
    color: obj.color,
    renderMode: obj.renderMode,
    samples: obj.samples.map(parseSampleV1),
  };
}

function parseSampleV1(s: unknown): Sample {
  if (!s || typeof s !== 'object') throw new Error('sample must be an object');
  const obj = s as { x?: unknown; y?: unknown; w?: unknown };
  if (typeof obj.x !== 'number' || typeof obj.y !== 'number' || typeof obj.w !== 'number') {
    throw new Error('sample fields x, y, w must be numbers');
  }
  return { x: obj.x, y: obj.y, w: obj.w };
}

function reportLoadError(err: unknown) {
  alert(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
