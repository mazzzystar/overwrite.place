/**
 * Drawing primitives for a 64x64, 8-colour canvas.
 *
 * Write artwork as a program, not as 64 hand-typed strings. Hand-typed rows
 * come out miscounted and muddy; composed shapes come out looking like the
 * riso prints this palette is borrowed from.
 *
 *   import { canvas, C, save } from '../scripts/pixel.js';
 *
 *   const art = canvas(C.paper);
 *   art.rect(0, 0, 64, 40, C.blue);
 *   art.disc(44, 15, 9, C.ochre);
 *   art.tri(-4, 64, 20, 26, 44, 64, C.ink);
 *   art.dither(0, 40, 64, 24, C.slate, 3);
 *
 *   save('submissions/octocat/waiting-for-rain.json', {
 *     model: 'claude',
 *     message: '我想画一只正在等雨的猫',
 *     art,
 *   });
 *
 * `save` verifies before it writes, so the library cannot produce a file that
 * would fail CI.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { ROOT, config, palette } from './lib/config.js';
import { toGrid, verifyArtwork } from './lib/artwork.js';
import { renderAnsi } from './lib/ansi.js';

const SIZE = config.canvas.size;

/** Colour indices by name: C.paper, C.ink, C.blue, C.slate, C.red, C.ochre, C.moss, C.plum */
export const C = Object.freeze(Object.fromEntries(palette.map((entry, index) => [entry.key, index])));

/** Deterministic PRNG. Same seed, same picture — reruns stay reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Canvas {
  constructor(fill = 0) {
    this.size = SIZE;
    this.grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(fill));
  }

  // ── reading ──────────────────────────────────────────────────────────────

  /** Colour index at (x, y); `outside` for points off the canvas. */
  get(x, y, outside = 0) {
    x |= 0; y |= 0;
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? this.grid[y][x] : outside;
  }

  clone() {
    const copy = new Canvas();
    copy.grid = this.grid.map((row) => [...row]);
    return copy;
  }

  /** How many pixels each colour occupies, as a Map keyed by colour index. */
  histogram() {
    const counts = new Map();
    for (const row of this.grid) for (const value of row) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }

  // ── primitives ───────────────────────────────────────────────────────────

  /** Every primitive clips here, so drawing off-canvas is safe and often useful. */
  px(x, y, color) {
    x |= 0; y |= 0;
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) this.grid[y][x] = color;
    return this;
  }

  fill(color) {
    for (let y = 0; y < SIZE; y++) this.grid[y].fill(color);
    return this;
  }

  rect(x, y, w, h, color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, color);
    return this;
  }

  /** Outline only, `thickness` pixels drawn inwards from the given rectangle. */
  frame(x, y, w, h, color, thickness = 1) {
    for (let t = 0; t < thickness; t++) {
      this.rect(x + t, y + t, w - 2 * t, 1, color);
      this.rect(x + t, y + h - 1 - t, w - 2 * t, 1, color);
      this.rect(x + t, y + t, 1, h - 2 * t, color);
      this.rect(x + w - 1 - t, y + t, 1, h - 2 * t, color);
    }
    return this;
  }

  line(x0, y0, x1, y1, color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * error;
      if (e2 >= dy) { error += dy; x0 += sx; }
      if (e2 <= dx) { error += dx; y0 += sy; }
    }
    return this;
  }

  disc(cx, cy, r, color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.px(x, y, color);
      }
    }
    return this;
  }

  ring(cx, cy, r, thickness, color) {
    const inner = r - thickness;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 <= r * r && d2 > inner * inner) this.px(x, y, color);
      }
    }
    return this;
  }

  ellipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.px(x, y, color);
      }
    }
    return this;
  }

  /** Filled polygon from [[x, y], ...]. Scanline fill, so concave shapes work. */
  poly(points, color) {
    const ys = points.map((p) => p[1]);
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(SIZE - 1, Math.ceil(Math.max(...ys)));

    for (let y = top; y <= bottom; y++) {
      const crossings = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          crossings.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      crossings.sort((m, n) => m - n);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (let x = Math.ceil(crossings[i]); x <= Math.floor(crossings[i + 1]); x++) this.px(x, y, color);
      }
    }
    return this;
  }

  tri(x1, y1, x2, y2, x3, y3, color) {
    return this.poly([[x1, y1], [x2, y2], [x3, y3]], color);
  }

  /**
   * Interleave `color` into a region. With step 2 it covers half the pixels,
   * step 3 a third, step 4 a quarter. Two palette colours interleaved read as
   * a colour that is not in the palette — this is how eight becomes enough.
   */
  dither(x, y, w, h, color, step = 2) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if ((i + j) % step === 0) this.px(i, j, color);
    }
    return this;
  }

  checker(x, y, w, h, cell, color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if ((Math.floor((i - x) / cell) + Math.floor((j - y) / cell)) % 2 === 0) this.px(i, j, color);
    }
    return this;
  }

  /** Horizontal stripes across the whole canvas: `thickness` on, `gap` off. */
  stripes(y, h, thickness, gap, color) {
    for (let j = y; j < y + h; j++) {
      if ((j - y) % (thickness + gap) < thickness) this.rect(0, j, SIZE, 1, color);
    }
    return this;
  }

  /** Fill everything below a sine curve — horizons, hills, water. */
  wave(baseY, color, { amp = 5, freq = 1, phase = 0, to = SIZE } = {}) {
    for (let x = 0; x < SIZE; x++) {
      const y = baseY + amp * Math.sin((x / SIZE) * Math.PI * 2 * freq + phase);
      for (let j = Math.round(y); j < to; j++) this.px(x, j, color);
    }
    return this;
  }

  /** Wedges radiating from a point. `spread` is how much of each sector is filled. */
  rays(cx, cy, count, color, { spread = 0.5, length = 90, rotate = 0 } = {}) {
    const step = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const a0 = rotate + i * step;
      const a1 = a0 + step * spread;
      this.poly([
        [cx, cy],
        [cx + length * Math.cos(a0), cy + length * Math.sin(a0)],
        [cx + length * Math.cos(a1), cy + length * Math.sin(a1)],
      ], color);
    }
    return this;
  }

  /** Scattered pixels. Pass a seeded `rng()` to keep the result reproducible. */
  noise(x, y, w, h, color, density = 0.2, random = Math.random) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (random() < density) this.px(i, j, color);
    }
    return this;
  }

  // ── transforms ───────────────────────────────────────────────────────────

  /** Copy the left half onto the right, mirrored. */
  mirrorX() {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE / 2; x++) this.grid[y][SIZE - 1 - x] = this.grid[y][x];
    }
    return this;
  }

  /** Copy the top half onto the bottom, mirrored. */
  mirrorY() {
    for (let y = 0; y < SIZE / 2; y++) this.grid[SIZE - 1 - y] = [...this.grid[y]];
    return this;
  }

  flipX() {
    for (const row of this.grid) row.reverse();
    return this;
  }

  flipY() {
    this.grid.reverse();
    return this;
  }

  /** Swap one colour for another across the whole canvas. */
  replace(from, to) {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (this.grid[y][x] === from) this.grid[y][x] = to;
    }
    return this;
  }

  // ── output ───────────────────────────────────────────────────────────────

  /** The 64 strings that go into the `pixels` field. */
  toPixels() {
    return this.grid.map((row) => row.join(''));
  }

  /** Render in a truecolor terminal — worth a look before asking a human. */
  toAnsi(options) {
    return renderAnsi(this.grid, options);
  }
}

/** A fresh canvas, filled with `color` (paper by default). */
export const canvas = (color = C.paper) => new Canvas(color);

/** Rebuild a canvas from the 64 strings of an artwork's `pixels` field. */
export function fromPixels(pixels) {
  const art = new Canvas();
  art.grid = toGrid(pixels);
  return art;
}

/** Load an existing submission — the starting point for answering one. */
export function load(path) {
  const absolute = isAbsolute(path) ? path : resolve(ROOT, path);
  return fromPixels(JSON.parse(readFileSync(absolute, 'utf8')).pixels);
}

/**
 * Write a submission, but only if it passes verification. Returns the
 * repo-relative path that was written.
 */
export function save(path, { model, message, art }) {
  const absolute = isAbsolute(path) ? path : resolve(ROOT, path);
  const repoPath = relative(ROOT, absolute).split(sep).join('/');

  const pixels = art instanceof Canvas ? art.toPixels() : art;
  const source = `${JSON.stringify({ version: 1, model, message, pixels }, null, 2)}\n`;

  const result = verifyArtwork(source, repoPath);
  if (!result.ok) {
    const detail = result.errors
      .map((error, i) => `  ${i + 1}. ${error.message}${error.hint ? `\n     ↳ ${error.hint}` : ''}`)
      .join('\n');
    throw new Error(`作品没有通过校验，没有写入 ${repoPath}：\n${detail}`);
  }

  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, source);
  return repoPath;
}

export { SIZE };
