const vscode = acquireVsCodeApi();
window.addEventListener('error', event => vscode.postMessage({ type: 'clientError', error: event.message }));
window.addEventListener('unhandledrejection', event => vscode.postMessage({ type: 'clientError', error: String(event.reason) }));
const status = document.getElementById('status');
const compileError = document.getElementById('compile-error');
const frames = new Map();
const pagination = new Map();
const pageProgress = document.getElementById('page-progress');
const host = document.getElementById('viewers');
let pdfPages = 0;
let progressFrame;
function showProgress(progress) {
  const { current = 0, total = 0 } = progress ?? {};
  const text = total ? `${current} / ${total}` : '— / —';
  if (pageProgress.textContent === text) return;
  pageProgress.textContent = text;
  pageProgress.setAttribute('aria-label', total ? `Page ${current} sur ${total}` : 'Pagination indisponible');
  vscode.postMessage({ type: 'pageProgress', current, total });
}
function updatePdfProgress() {
  if (state?.native) return;
  const bounds = host.getBoundingClientRect();
  let current = 1, visible = -1;
  for (const page of host.querySelectorAll('.page')) {
    const rect = page.getBoundingClientRect();
    const height = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
    if (height > visible) { visible = height; current = Number(page.dataset.page); }
  }
  showProgress({ current, total: pdfPages });
}
function schedulePdfProgress() {
  cancelAnimationFrame(progressFrame);
  progressFrame = requestAnimationFrame(updatePdfProgress);
}
host.addEventListener('scroll', schedulePdfProgress, { passive: true });
new ResizeObserver(schedulePdfProgress).observe(host);
let state;
let epoch = 0;
let rendered;
let workerSource;
const controls = frame => frame.contentWindow?.postMessage({ token: state.tokens?.[frame.dataset.variant], jumps: state.jumps }, new URL(frame.src).origin);
async function pdf(data) {
  if (rendered === data) return;
  rendered = data;
  const revision = ++epoch;
  pdfPages = 0;
  showProgress();
  host.replaceChildren();
  host.scrollTop = 0;
  const base = document.body.dataset.pdfjs;
  const pdfjs = await import(base + 'pdf.mjs');
  workerSource ??= fetch(base + 'pdf.worker.mjs').then(response => { if (!response.ok) throw new Error('Chargement du lecteur PDF impossible.'); return response.text(); });
  // Workers loaded from a Blob and font outlines avoid webview origin/font-loading stalls.
  const url = URL.createObjectURL(new Blob([await workerSource], { type: 'text/javascript' }));
  const port = new Worker(url, { type: 'module' });
  const worker = new pdfjs.PDFWorker({ port });
  const loading = pdfjs.getDocument({ worker, useWorkerFetch: false, disableFontFace: true, data: Uint8Array.from(atob(data), c => c.charCodeAt(0)), cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/' });
  try {
    const doc = await loading.promise;
    if (revision !== epoch) return;
    pdfPages = doc.numPages;
    for (let n = 1; n <= doc.numPages && revision === epoch; n++) {
      const page = await doc.getPage(n);
      const scale = Math.max(0.2, (host.clientWidth - 24) / page.getViewport({ scale: 1 }).width);
      const viewport = page.getViewport({ scale });
      const pageView = document.createElement('div'); pageView.className = 'page';
      pageView.dataset.page = String(n);
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      const textLayer = document.createElement('div'); textLayer.className = 'textLayer';
      if (revision !== epoch) break;
      pageView.append(canvas, textLayer); host.append(pageView);
      schedulePdfProgress();
      await Promise.all([
        page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, intent: 'print' }).promise,
        new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render()
      ]);
    }
    if (revision === epoch) vscode.postMessage({ type: 'pdfReady', pages: doc.numPages });
  } finally { await loading.destroy(); worker.destroy(); port.terminate(); URL.revokeObjectURL(url); }
}
for (const id of ['enonce', 'corrige', 'save', 'jumps', 'theme', 'fullscreen', 'restart']) {
  document.getElementById(id).onclick = () => vscode.postMessage({ type: id });
}
window.addEventListener('message', ({ data }) => {
  if (data?.channel !== document.body.dataset.channel) return;
  if (data.type === 'reset') { ++epoch; rendered = undefined; pdfPages = 0; pagination.clear(); showProgress(); for (const frame of frames.values()) frame.remove(); frames.clear(); }
  if (data.type === 'status') { status.textContent = data.message; status.hidden = false; }
  if (data.type === 'compileError') { compileError.textContent = data.message; compileError.hidden = !data.message; }
  if (data.type !== 'show') return;
  state = data;
  if (data.native) showProgress(pagination.get(data.variant));
  document.body.classList.toggle('pdf-dark', !data.native && data.dark);
  document.getElementById('jumps').disabled = !data.native;
  if (data.pdf) { status.hidden = true; void pdf(data.pdf).catch(error => { rendered = undefined; status.textContent = String(error); status.hidden = false; vscode.postMessage({ type: 'pdfError', error: String(error) }); }); }
  for (const [variant, url] of Object.entries(data.sessions)) {
    if (!frames.has(variant)) {
      const frame = document.createElement('iframe');
      frame.title = `${data.labels[variant]} — Tinymist`;
      frame.src = url;
      frame.dataset.variant = variant;
      frame.addEventListener('load', () => { controls(frame); vscode.postMessage({ type: 'frameReady', variant }); });
      frames.set(variant, frame);
      document.getElementById('viewers').append(frame);
    }
  }
  for (const [variant, frame] of frames) { frame.hidden = variant !== data.variant; controls(frame); }
  for (const variant of ['enonce', 'corrige']) document.getElementById(variant).setAttribute('aria-pressed', String(variant === data.variant));
  document.getElementById('jumps').setAttribute('aria-pressed', String(data.jumps));
  document.getElementById('theme').setAttribute('aria-pressed', String(data.dark));
  status.hidden = !!data.pdf || frames.has(data.variant);
});
window.addEventListener('message', event => {
  const data = event.data;
  if (data?.type !== 'pageProgress') return;
  for (const [variant, frame] of frames) {
    if (event.source !== frame.contentWindow || event.origin !== new URL(frame.src).origin || data.token !== state.tokens?.[variant]) continue;
    if (!Number.isInteger(data.current) || !Number.isInteger(data.total) || data.total < 1 || data.current < 1 || data.current > data.total) return;
    pagination.set(variant, { current: data.current, total: data.total });
    if (state.variant === variant) showProgress(data);
  }
});
window.addEventListener('keydown', event => {
  if (state?.native || !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) return;
  event.preventDefault();
  const host = document.getElementById('viewers');
  host.scrollBy({ top: (event.key.endsWith('Down') ? 1 : -1) * (event.key.startsWith('Page') ? host.clientHeight * .9 : 60) });
});
vscode.postMessage({ type: 'ready' });
