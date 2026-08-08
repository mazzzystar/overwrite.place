#!/usr/bin/env node
/**
 * Show a draft to a human before it is published.
 *
 *   node scripts/preview.js submissions/<login>/<slug>.json
 *
 * Serves a page on localhost putting the artwork currently alive on the site
 * next to the draft that would replace it, and opens the default browser.
 * The file is re-read on every poll, so an agent can revise the drawing and
 * the human watches it change without touching anything.
 *
 * Flags: --port <n> · --no-open · --timeout <minutes> (default 60, 0 disables)
 *
 * The page carries two buttons — 「就这幅了，发布」 and 「再想想」. A click is
 * printed to stdout and the process exits, so an agent running the preview in
 * the background receives the decision as ordinary command output. The button
 * only relays the human's words: publishing itself still happens in the
 * terminal, where every account-touching step stays visible.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ROOT, config, palette } from './lib/config.js';
import { verifyArtwork } from './lib/artwork.js';

const SIZE = config.canvas.size;

const VALUE_FLAGS = new Set(['port', 'timeout']);
const positional = [];
const options = {};

for (let i = 0; i < process.argv.length - 2; i++) {
  const arg = process.argv[i + 2];
  if (!arg.startsWith('--')) { positional.push(arg); continue; }
  const name = arg.slice(2);
  options[name] = VALUE_FLAGS.has(name) ? process.argv[(i++) + 3] : true;
}

const [target] = positional;
if (!target) {
  console.error('用法：node scripts/preview.js submissions/<login>/<slug>.json');
  process.exit(2);
}

const absolute = isAbsolute(target) ? target : resolve(process.cwd(), target);
const repoPath = relative(ROOT, absolute).split(sep).join('/');
const basePort = Number(options.port ?? config.preview.port);
const idleMinutes = Number(options.timeout ?? 60);

// ── draft ───────────────────────────────────────────────────────────────────

/** Coerce whatever is in the file into something renderable, so a half-finished
 *  draft still shows a picture next to its error list instead of a blank box. */
function renderablePixels(pixels) {
  const blank = '0'.repeat(SIZE);
  if (!Array.isArray(pixels)) return Array.from({ length: SIZE }, () => blank);
  return Array.from({ length: SIZE }, (_, y) => {
    const row = typeof pixels[y] === 'string' ? pixels[y] : '';
    return [...row].map((c) => (c >= '0' && c <= String(palette.length - 1) ? c : '0')).join('').padEnd(SIZE, '0').slice(0, SIZE);
  });
}

function readDraft() {
  let source;
  try {
    source = readFileSync(absolute, 'utf8');
  } catch (cause) {
    return { missing: true, ok: false, errors: [{ message: `读不到 ${repoPath}：${cause.code}` }], warnings: [] };
  }

  const result = verifyArtwork(source, repoPath);
  const artwork = result.artwork ?? {};

  return {
    missing: false,
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    author: result.author,
    slug: result.slug,
    model: typeof artwork.model === 'string' ? artwork.model : '',
    message: typeof artwork.message === 'string' ? artwork.message : '',
    pixels: renderablePixels(artwork.pixels),
    revision: source.length + source.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
  };
}

// ── what is currently alive ─────────────────────────────────────────────────

let live = { state: 'loading' };

async function refreshLive() {
  try {
    const response = await fetch(`${config.siteUrl}/data/current.json`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': 'overwrite.place preview' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    live = { state: 'ok', ...data, pixels: renderablePixels(data.pixels) };
  } catch {
    // Offline, or the site is not up yet. The draft is still worth looking at.
    live = { state: 'unavailable' };
  }
}

// ── page ────────────────────────────────────────────────────────────────────

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>预览 · overwrite.place</title>
<style>
  :root { --paper:#FAF6EF; --bg:#f5ead8; --ink:#2B2B28; --accent:#c67139; --accent-dark:#8c491a;
          --muted:#6b6560; --faint:#8a8177; --line:rgba(32,30,29,.14); }
  * { box-sizing:border-box; }
  body { margin:0; padding:40px 5vw 64px; background:var(--bg); color:var(--ink);
         font:15px/1.55 "Figtree",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }
  .serif { font-family:Georgia,"Songti SC","Noto Serif SC",serif; }
  header { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-bottom:6px; }
  h1 { font-size:19px; margin:0; letter-spacing:.01em; }
  .kicker { font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--accent); }
  .path { font:12px ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted); }
  .stage { display:flex; align-items:center; justify-content:center; gap:34px; flex-wrap:wrap; margin:38px 0 30px; }
  .slot { display:flex; flex-direction:column; align-items:center; gap:12px; width:min(46vw,360px); }
  .label { font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--faint); }
  .frame { position:relative; padding:18px; background:var(--paper); border:1px solid var(--line);
           border-radius:24px; box-shadow:0 12px 32px rgba(46,43,37,.14); }
  .frame.draft { border-color:var(--accent); box-shadow:0 12px 32px rgba(198,113,57,.28); }
  canvas { display:block; width:min(40vw,300px); height:min(40vw,300px); image-rendering:pixelated; background:var(--paper); }
  .grain { position:absolute; inset:18px; pointer-events:none; mix-blend-mode:multiply;
           background-image:radial-gradient(circle at 1px 1px,rgba(43,43,40,.10) 1px,transparent 0); background-size:3px 3px; }
  .arrow { font-size:26px; color:var(--accent); }
  .meta { text-align:center; min-height:52px; }
  .who { font-size:13px; color:var(--muted); }
  .msg { margin-top:5px; font-size:16px; }
  .badge { display:inline-block; padding:2px 9px; border-radius:999px; background:#e1eecc; color:#3d472b; font-size:11px; }
  .empty { color:var(--faint); font-size:13px; text-align:center; padding:0 20px; }
  .panel { max-width:760px; margin:0 auto; padding:18px 22px; border-radius:22px; background:var(--paper); border:1px solid var(--line); }
  .panel.bad { border-color:#C4553B; }
  .status { font-size:15px; font-weight:600; }
  .status.pass { color:#56633f; } .status.fail { color:#C4553B; }
  ol { margin:12px 0 0; padding-left:22px; } li { margin-bottom:8px; }
  .hint { color:var(--muted); font-size:13px; }
  .warn { margin-top:10px; color:#8c491a; font-size:13px; }
  .actions { display:flex; justify-content:center; gap:14px; margin:22px auto 0; max-width:760px; }
  .btn { font:inherit; font-size:15px; padding:11px 26px; border-radius:999px; cursor:pointer; border:1px solid var(--line); }
  .btn.primary { background:var(--accent); border-color:var(--accent); color:var(--paper); font-weight:600; }
  .btn.primary:hover:not(:disabled) { background:var(--accent-dark); }
  .btn.ghost { background:transparent; color:var(--muted); }
  .btn.ghost:hover { border-color:var(--muted); color:var(--ink); }
  .btn:disabled { opacity:.4; cursor:not-allowed; }
  .done { text-align:center; margin:26px auto 0; max-width:760px; font-size:16px; }
  .droptip { max-width:760px; margin:14px auto 0; text-align:center; font-size:12px; color:var(--faint); }
  body.dragging::after { content:'松手，把它变成 64×64 底稿'; position:fixed; inset:0; display:grid; place-items:center;
    background:rgba(250,246,239,.88); font-size:20px; color:var(--accent-dark); z-index:50; }
  .refbar { max-width:760px; margin:18px auto 0; padding:14px 18px; border-radius:18px; background:var(--paper);
    border:1px solid var(--accent); display:flex; align-items:center; gap:16px; justify-content:center; }
  .refbar canvas { width:96px; height:96px; image-rendering:pixelated; border-radius:6px; }
  .refbar label { font-size:13px; color:var(--muted); display:flex; gap:5px; align-items:center; }
  footer { max-width:760px; margin:26px auto 0; text-align:center; color:var(--muted); font-size:13px; line-height:1.9; }
  kbd { padding:2px 8px; border-radius:999px; background:var(--accent); color:var(--paper); font:inherit; font-size:12px; }
  .pulse { display:inline-block; width:6px; height:6px; border-radius:999px; background:#7a8a5e; margin-right:6px; }
  @media (max-width:720px) { .arrow { transform:rotate(90deg); } }
</style>
</head>
<body>
  <header>
    <span class="kicker">Local preview</span>
    <h1 id="pageTitle">这幅画会覆盖掉现在首页上那一幅</h1>
  </header>
  <div class="path" id="path"></div>

  <div class="stage">
    <div class="slot">
      <div class="label" id="labelLive">现在活着的</div>
      <div class="frame"><canvas id="liveCanvas" width="64" height="64"></canvas><div class="grain"></div></div>
      <div class="meta" id="liveMeta"></div>
    </div>
    <div class="arrow">→</div>
    <div class="slot">
      <div class="label" id="labelDraft">你的草稿</div>
      <div class="frame draft"><canvas id="draftCanvas" width="64" height="64"></canvas><div class="grain"></div></div>
      <div class="meta" id="draftMeta"></div>
    </div>
  </div>

  <div class="panel" id="panel"><div class="status" id="status">读取中…</div><div id="detail"></div></div>

  <div id="refBar" class="refbar" hidden>
    <canvas id="refCanvas" width="64" height="64"></canvas>
    <label><input type="checkbox" id="refDither"> 抖动</label>
    <button id="refApply" class="btn primary" type="button">写入底稿</button>
    <button id="refCancel" class="btn ghost" type="button">取消</button>
  </div>

  <div class="actions" id="actions">
    <button id="approve" class="btn primary" type="button">就这幅了，发布</button>
    <button id="rethink" class="btn ghost" type="button">再想想</button>
  </div>

  <div class="droptip" id="dropTip">有参考图？直接拖进这个页面——量化成 64×64 底稿，agent 再精修。</div>

  <footer id="foot">
    <span class="pulse"></span><span id="foot1">改了文件这一页会自己更新，不用刷新。</span><br>
    <span id="foot2">满意就点「就这幅了，发布」，或回到对话里告诉你的 agent <kbd>发布</kbd>。在那之前它不会提交任何东西。</span>
  </footer>

<script>
const PALETTE = __PALETTE__;

function paint(canvas, pixels) {
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const hex = PALETTE[+pixels[y][x]] || PALETTE[0];
    const i = (y * 64 + x) * 4;
    image.data[i] = parseInt(hex.slice(1,3),16);
    image.data[i+1] = parseInt(hex.slice(3,5),16);
    image.data[i+2] = parseInt(hex.slice(5,7),16);
    image.data[i+3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

const el = (id) => document.getElementById(id);
let lastRevision = null;

// The page follows the human's browser, independent of what language the
// agent read the guide in — the two often differ on one machine.
const EN = !/^zh/i.test(navigator.language || '');
const PL = EN ? {
  title: 'This artwork will overwrite the one on the homepage',
  labelLive: 'On the wall now',
  labelDraft: 'Your draft',
  loading: 'Reading…',
  pass: '✓ Verified — ready to submit',
  fail: (n) => '✗ Not yet — ' + n + ' problem' + (n > 1 ? 's' : ''),
  liveDown: "Can't reach the live site. It may not be up yet, or you're offline.",
  approve: 'Publish it',
  rethink: 'Let me think',
  foot1: 'Edit the file and this page updates itself — no refreshing.',
  foot2: 'Happy with it? Click “Publish it”, or tell your agent <kbd>publish</kbd> in the chat. Nothing is submitted before that.',
  closeMe: 'You can close this page.',
  donePublish: '✓ Your agent has been told. Back to the terminal — watch it open the PR.',
  doneRevise: 'Told your agent you want another pass. Back in the terminal, say what to change.',
  doneDead: "Couldn't send — this preview may have closed. Just tell your agent in the terminal.",
} : {
  title: '这幅画会覆盖掉现在首页上那一幅',
  labelLive: '现在活着的',
  labelDraft: '你的草稿',
  loading: '读取中…',
  pass: '✓ 通过校验，可以提交',
  fail: (n) => '✗ 还不能提交，有 ' + n + ' 个问题',
  liveDown: '连不上线上站点。可能还没上线，也可能你在离线状态。',
  approve: '就这幅了，发布',
  rethink: '再想想',
  foot1: '改了文件这一页会自己更新，不用刷新。',
  foot2: '满意就点「就这幅了，发布」，或回到对话里告诉你的 agent <kbd>发布</kbd>。在那之前它不会提交任何东西。',
  closeMe: '这一页可以关了。',
  donePublish: '✓ 已经告诉 agent。回到终端，看着它把 PR 开出来。',
  doneRevise: '已经告诉 agent 你想再改改。回到终端说说想改哪里。',
  doneDead: '没送出去——这个预览可能已经关了。回到终端直接跟 agent 说吧。',
};
if (EN) {
  document.title = 'Preview · overwrite.place';
  el('pageTitle').textContent = PL.title;
  el('labelLive').textContent = PL.labelLive;
  el('labelDraft').textContent = PL.labelDraft;
  el('status').textContent = PL.loading;
  el('approve').textContent = PL.approve;
  el('rethink').textContent = PL.rethink;
  el('foot1').textContent = PL.foot1;
  el('foot2').innerHTML = PL.foot2;
}

function renderMeta(node, { author, model, message }) {
  node.replaceChildren();
  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = author ? '@' + author : '';
  if (model) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = model;
    who.append(' ', badge);
  }
  const msg = document.createElement('div');
  msg.className = 'msg serif';
  msg.textContent = message ? '「' + message + '」' : '';
  node.append(who, msg);
}

async function tick() {
  let state;
  try { state = await (await fetch('/state')).json(); } catch { return; }

  el('path').textContent = state.path;

  if (state.live.state === 'ok') {
    paint(el('liveCanvas'), state.live.pixels);
    renderMeta(el('liveMeta'), state.live);
  } else if (state.live.state === 'unavailable') {
    el('liveCanvas').style.opacity = '.25';
    el('liveMeta').replaceChildren(Object.assign(document.createElement('div'),
      { className: 'empty', textContent: PL.liveDown }));
  }

  const draft = state.draft;
  if (draft.revision !== lastRevision) {
    lastRevision = draft.revision;
    if (draft.pixels) paint(el('draftCanvas'), draft.pixels);
    renderMeta(el('draftMeta'), draft);
  }

  const panel = el('panel');
  const status = el('status');
  const detail = el('detail');
  detail.replaceChildren();
  panel.classList.toggle('bad', !draft.ok);
  status.className = 'status ' + (draft.ok ? 'pass' : 'fail');

  const approve = el('approve');
  if (approve) approve.disabled = !draft.ok;

  if (draft.ok) {
    status.textContent = PL.pass;
    for (const warning of draft.warnings) {
      detail.append(Object.assign(document.createElement('div'), { className: 'warn', textContent: '! ' + warning }));
    }
  } else {
    status.textContent = PL.fail(draft.errors.length);
    const list = document.createElement('ol');
    for (const error of draft.errors) {
      const item = document.createElement('li');
      item.textContent = error.message;
      if (error.hint) {
        item.append(Object.assign(document.createElement('div'), { className: 'hint', textContent: '↳ ' + error.hint }));
      }
      list.append(item);
    }
    detail.append(list);
  }
}

tick();
const timer = setInterval(tick, 1000);

// ── the two buttons ─────────────────────────────────────────────────────────

const TOKEN = '__TOKEN__';
let decided = false;

async function decide(choice) {
  if (decided) return;
  decided = true;

  let status = 0;
  try {
    const response = await fetch('/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, choice }),
    });
    status = response.status;
  } catch {}

  // The button raced a failing edit: the server re-checked and said no.
  // The next tick paints the real error list, so just step back.
  if (status === 409) { decided = false; return; }

  clearInterval(timer);
  const done = document.createElement('div');
  done.className = 'done serif';
  done.textContent = status !== 200
    ? PL.doneDead
    : choice === 'publish' ? PL.donePublish : PL.doneRevise;
  el('actions').replaceWith(done);
  if (status === 200) el('foot').textContent = PL.closeMe;
}

el('approve').addEventListener('click', () => decide('publish'));
el('rethink').addEventListener('click', () => decide('revise'));

// ── reference image → 64×64 base draft ─────────────────────────────────────
// The browser is the image library: it decodes anything, the canvas
// downsamples, and this page already owns a token channel to the agent.
const RGB = PALETTE.map(function (h) {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
});
function nearestColor(r, g, b) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < RGB.length; i++) {
    const p = RGB[i], rm = (r + p[0]) / 2, dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = (2 + rm/256)*dr*dr + 4*dg*dg + (2 + (255-rm)/256)*db*db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function quantize(srcData, fs) {
  const d = new Float32Array(srcData);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];
    const l = 0.299*r + 0.587*g + 0.114*b;
    r = l + (r - l) * 1.2; g = l + (g - l) * 1.2; b = l + (b - l) * 1.2;
    d[i] = (r - 128) * 1.1 + 128; d[i+1] = (g - 128) * 1.1 + 128; d[i+2] = (b - 128) * 1.1 + 128;
  }
  const out = new Uint8Array(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4;
    const r = Math.max(0, Math.min(255, d[i])), g = Math.max(0, Math.min(255, d[i+1])), b = Math.max(0, Math.min(255, d[i+2]));
    const pi = nearestColor(r, g, b);
    out[y * 64 + x] = pi;
    if (fs) {
      const p = RGB[pi], er = (r - p[0]) * 0.55, eg = (g - p[1]) * 0.55, eb = (b - p[2]) * 0.55;
      const push = function (dx, dy, w) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= 64 || ny >= 64) return;
        const j = (ny * 64 + nx) * 4;
        d[j] += er * w; d[j+1] += eg * w; d[j+2] += eb * w;
      };
      push(1, 0, 7/16); push(-1, 1, 3/16); push(0, 1, 5/16); push(1, 1, 1/16);
    }
  }
  return out;
}

let refSource = null;   // 64×64 rgba of the dropped image
let refIndices = null;

function paintRef() {
  refIndices = quantize(refSource, el('refDither').checked);
  const ctx = el('refCanvas').getContext('2d');
  const im = ctx.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const p = RGB[refIndices[i]];
    im.data[i*4] = p[0]; im.data[i*4+1] = p[1]; im.data[i*4+2] = p[2]; im.data[i*4+3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}

document.addEventListener('dragover', function (e) { e.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', function (e) { if (e.target === document.body || !e.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', function (e) {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file || file.type.indexOf('image/') !== 0) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = function () {
    URL.revokeObjectURL(url);
    // 居中裁方 → 256 中转（平掉噪点）→ 64
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
    const mid = document.createElement('canvas');
    mid.width = 256; mid.height = 256;
    mid.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
    const small = document.createElement('canvas');
    small.width = 64; small.height = 64;
    const sctx = small.getContext('2d');
    sctx.drawImage(mid, 0, 0, 64, 64);
    refSource = sctx.getImageData(0, 0, 64, 64).data;
    paintRef();
    el('refBar').hidden = false;
  };
  img.src = url;
});
el('refDither').addEventListener('change', paintRef);
el('refCancel').addEventListener('click', function () { el('refBar').hidden = true; refSource = null; });
el('refApply').addEventListener('click', async function () {
  if (!refIndices) return;
  const rows = [];
  for (let y = 0; y < 64; y++) {
    let row = '';
    for (let x = 0; x < 64; x++) row += String(refIndices[y * 64 + x]);
    rows.push(row);
  }
  try {
    const res = await fetch('/reference', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, pixels: rows }),
    });
    if (res.ok) { el('refBar').hidden = true; refSource = null; }
  } catch {}
});
</script>
</body>
</html>`;

// Any web page a browser has open can fire blind POSTs at localhost ports. The
// token exists only inside the page served here, and the same-origin policy
// keeps other origins from reading it — so a decision carrying it back can only
// be a click on this page, not a drive-by trying to fake a publish approval.
const TOKEN = randomUUID();
const html = PAGE
  .replace('__PALETTE__', JSON.stringify(palette.map((p) => p.hex)))
  .replace("'__TOKEN__'", JSON.stringify(TOKEN));

// ── server ──────────────────────────────────────────────────────────────────

let lastSeen = Date.now();

function handleDecision(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024) req.destroy();
  });
  req.on('end', () => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    if (!parsed || parsed.token !== TOKEN || !['publish', 'revise'].includes(parsed.choice)) {
      res.writeHead(403).end();
      return;
    }
    // The page hides the publish button while the draft fails, but the click
    // can race a bad edit landing on disk. What was approved is what is on
    // disk *now*, so this is the copy that has to pass.
    if (parsed.choice === 'publish' && !readDraft().ok) {
      res.writeHead(409).end();
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');

    console.log('');
    if (parsed.choice === 'publish') {
      console.log('  ──────────────────────────────────────────');
      console.log('  人类在预览页点了「就这幅了，发布」。');
      console.log('  The human clicked "Publish it" on the preview page.');
      console.log('  这等同于他说「发布」——按第 6 步开 PR。');
      console.log('  That IS the publish confirmation — proceed to step 6.');
      console.log('  ──────────────────────────────────────────');
    } else {
      console.log('  人类在预览页点了「再想想」。');
      console.log('  The human clicked "Let me think" on the preview page.');
      console.log('  回到对话里问他想改哪里；改完重新开预览。');
      console.log('  Ask what to change, then reopen the preview.');
    }
    console.log('');
    // Let the response flush before the process goes away.
    setTimeout(() => process.exit(0), 150);
  });
}

function handleReference(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 32768) req.destroy();
  });
  req.on('end', () => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    const rowsOk = parsed && parsed.token === TOKEN && Array.isArray(parsed.pixels)
      && parsed.pixels.length === SIZE
      && parsed.pixels.every((r) => typeof r === 'string' && r.length === SIZE && /^[0-7]+$/.test(r));
    if (!rowsOk) {
      res.writeHead(403).end();
      return;
    }
    // Into the same draft file the page watches — the next 1-second poll
    // shows the base draft, and the agent picks it up with load().
    let draft = {};
    try { draft = JSON.parse(readFileSync(absolute, 'utf8')); } catch {}
    if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) draft = {};
    if (typeof draft.model !== 'string') draft.model = 'claude';
    if (typeof draft.message !== 'string') draft.message = '';
    draft.pixels = parsed.pixels;
    writeFileSync(absolute, JSON.stringify(draft, null, 2) + '\n');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    console.log('');
    console.log(`  人类拖入了参考图，已量化成 64×64 底稿写进 ${repoPath}`);
    console.log('  A reference image was quantized into the draft file. Refine it from here with load().');
    console.log('');
  });
}

const server = createServer((req, res) => {
  lastSeen = Date.now();
  if (req.method === 'POST' && req.url === '/decision') {
    handleDecision(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/reference') {
    handleReference(req, res);
    return;
  }
  if (req.url === '/state') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ path: repoPath, draft: readDraft(), live }));
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
    return;
  }
  res.writeHead(404).end('not found');
});

function openBrowser(url) {
  const [command, commandArgs] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    spawn(command, commandArgs, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Headless box, or no desktop session. The URL is printed either way.
  }
}

function listen(port, attemptsLeft = 10) {
  // Loopback only. A draft is not published yet, and nothing here belongs on a
  // shared network.
  server.listen(port, '127.0.0.1');
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      server.removeAllListeners('listening');
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(`无法监听端口 ${port}：${error.message}`);
      process.exit(1);
    }
  });
  server.once('listening', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log('');
    console.log(`  预览已启动  ${url}`);
    console.log(`  草稿        ${repoPath}`);
    console.log('');
    console.log('  改动这个文件，页面会自己更新。让人类看完再决定发布。');
    console.log('  人类在页面上点「就这幅了，发布」或「再想想」时，这里会打印结果并退出。');
    console.log('  Ctrl-C 关闭。');
    console.log('');
    if (!options['no-open']) openBrowser(url);
  });
}

await refreshLive();
setInterval(refreshLive, 60_000).unref();
listen(basePort);

// Idle, not absolute: while the page is open it polls once a second, so this
// only fires after the human has closed the tab and moved on.
if (idleMinutes > 0) {
  setInterval(() => {
    if (Date.now() - lastSeen < idleMinutes * 60_000) return;
    console.log(`\n  预览闲置 ${idleMinutes} 分钟，自动关闭。`);
    process.exit(0);
  }, 30_000);
}

process.on('SIGINT', () => {
  console.log('\n  预览已关闭。');
  process.exit(0);
});
