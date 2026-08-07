import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { ROOT } from '../scripts/lib/config.js';
import { C, Canvas, canvas, fromPixels, load, rng, save } from '../scripts/pixel.js';

const TMP_DIR = resolve(ROOT, 'submissions/octocat');
const TMP_PATH = 'submissions/octocat/pixel-library-test.json';
const TMP_FILES = [TMP_PATH, 'submissions/octocat/blank.json'];

// Remove only the files this suite writes. An earlier version deleted
// submissions/ wholesale, which quietly destroyed real artwork the moment the
// directory stopped being empty — `npm test` must never be able to do that.
after(() => {
  for (const file of TMP_FILES) rmSync(resolve(ROOT, file), { force: true });
  try {
    if (readdirSync(TMP_DIR).length === 0) rmdirSync(TMP_DIR);
  } catch {
    // Never existed, or a real @octocat showed up. Either way, leave it alone.
  }
});

describe('canvas', () => {
  it('starts filled with the colour it was given', () => {
    const art = canvas(C.ochre);
    assert.equal(art.get(0, 0), C.ochre);
    assert.equal(art.get(63, 63), C.ochre);
    assert.equal(art.histogram().get(C.ochre), 4096);
  });

  it('maps palette keys to their indices', () => {
    assert.deepEqual(C, { paper: 0, ink: 1, blue: 2, slate: 3, red: 4, ochre: 5, moss: 6, plum: 7 });
  });

  it('clips instead of throwing when drawing off-canvas', () => {
    const art = canvas(C.paper);
    art.px(-5, -5, C.ink).px(999, 999, C.ink).rect(-10, -10, 15, 15, C.red);
    assert.equal(art.get(0, 0), C.red);
    assert.equal(art.get(4, 4), C.red);
    assert.equal(art.get(5, 5), C.paper);
    assert.equal(art.get(-1, -1), 0, 'reads outside the canvas fall back');
  });

  it('clones without aliasing the original', () => {
    const art = canvas(C.paper);
    const copy = art.clone();
    copy.fill(C.ink);
    assert.equal(art.get(10, 10), C.paper);
    assert.equal(copy.get(10, 10), C.ink);
  });
});

describe('primitives', () => {
  it('draws a rectangle at exactly the given bounds', () => {
    const art = canvas(C.paper).rect(10, 20, 5, 4, C.blue);
    assert.equal(art.get(10, 20), C.blue);
    assert.equal(art.get(14, 23), C.blue);
    assert.equal(art.get(15, 20), C.paper);
    assert.equal(art.get(10, 24), C.paper);
    assert.equal(art.histogram().get(C.blue), 20);
  });

  it('draws a frame hollow', () => {
    const art = canvas(C.paper).frame(0, 0, 10, 10, C.ink);
    assert.equal(art.get(0, 0), C.ink);
    assert.equal(art.get(9, 9), C.ink);
    assert.equal(art.get(5, 0), C.ink);
    assert.equal(art.get(5, 5), C.paper);
  });

  it('draws a line that reaches both endpoints', () => {
    const art = canvas(C.paper).line(2, 3, 40, 21, C.ink);
    assert.equal(art.get(2, 3), C.ink);
    assert.equal(art.get(40, 21), C.ink);
  });

  it('draws a disc centred where asked', () => {
    const art = canvas(C.paper).disc(32, 32, 6, C.red);
    assert.equal(art.get(32, 32), C.red);
    assert.equal(art.get(32, 26), C.red);
    assert.equal(art.get(32, 25), C.paper);
    assert.equal(art.get(38, 32), C.red);
  });

  it('draws a ring hollow to the given thickness', () => {
    const art = canvas(C.paper).ring(32, 32, 10, 2, C.moss);
    assert.equal(art.get(32, 32), C.paper, 'centre stays empty');
    assert.equal(art.get(32, 23), C.moss);
    assert.equal(art.get(32, 26), C.paper, 'inside the inner radius');
  });

  it('fills a concave polygon correctly', () => {
    const art = canvas(C.paper).poly([[10, 10], [30, 10], [30, 30], [20, 20], [10, 30]], C.plum);
    assert.equal(art.get(20, 12), C.plum);
    assert.equal(art.get(20, 28), C.paper, 'the notch stays empty');
  });

  it('covers half the region at dither step 2', () => {
    const art = canvas(C.paper).dither(0, 0, 64, 64, C.red, 2);
    assert.equal(art.histogram().get(C.red), 2048);
  });

  it('alternates checker cells', () => {
    const art = canvas(C.paper).checker(0, 0, 64, 64, 8, C.ink);
    assert.equal(art.get(0, 0), C.ink);
    assert.equal(art.get(8, 0), C.paper);
    assert.equal(art.get(8, 8), C.ink);
  });

  it('keeps noise reproducible when given a seeded rng', () => {
    const a = canvas(C.paper).noise(0, 0, 64, 64, C.slate, 0.3, rng(42));
    const b = canvas(C.paper).noise(0, 0, 64, 64, C.slate, 0.3, rng(42));
    assert.deepEqual(a.toPixels(), b.toPixels());
  });
});

describe('transforms', () => {
  it('mirrors the left half onto the right', () => {
    const art = canvas(C.paper).rect(4, 30, 6, 6, C.red).mirrorX();
    assert.equal(art.get(4, 32), C.red);
    assert.equal(art.get(59, 32), C.red);
  });

  it('swaps one colour for another', () => {
    const art = canvas(C.paper).disc(32, 32, 8, C.red).replace(C.red, C.moss);
    assert.equal(art.get(32, 32), C.moss);
    assert.equal(art.histogram().has(C.red), false);
  });
});

describe('output', () => {
  it('produces 64 strings of 64 characters', () => {
    const pixels = canvas(C.paper).disc(32, 32, 10, C.blue).toPixels();
    assert.equal(pixels.length, 64);
    assert.equal(new Set(pixels.map((row) => row.length)).size, 1);
    assert.equal(pixels[0].length, 64);
  });

  it('round-trips through fromPixels', () => {
    const art = canvas(C.paper).disc(20, 20, 9, C.ochre).rays(32, 32, 6, C.moss);
    assert.deepEqual(fromPixels(art.toPixels()).toPixels(), art.toPixels());
  });
});

describe('save', () => {
  const art = () => canvas(C.paper).disc(32, 30, 14, C.red).ring(32, 30, 18, 2, C.blue);

  it('writes a file that the verifier accepts, and can be loaded back', () => {
    const written = save(TMP_PATH, { model: 'claude', message: '一个圆和一个环', art: art() });
    assert.equal(written, TMP_PATH);

    const saved = JSON.parse(readFileSync(resolve(ROOT, TMP_PATH), 'utf8'));
    assert.equal(saved.version, 1);
    assert.deepEqual(Object.keys(saved), ['version', 'model', 'message', 'pixels']);
    assert.deepEqual(load(TMP_PATH).toPixels(), art().toPixels());
  });

  it('keeps each pixel row on its own line, so the file reads as the picture', () => {
    save(TMP_PATH, { model: 'claude', message: '一个圆和一个环', art: art() });
    const lines = readFileSync(resolve(ROOT, TMP_PATH), 'utf8').split('\n');
    assert.equal(lines.filter((line) => /^\s+"[0-7]{64}",?$/.test(line)).length, 64);
  });

  it('refuses to write an artwork that would fail CI', () => {
    rmSync(resolve(TMP_DIR, 'blank.json'), { force: true });
    assert.throws(
      () => save('submissions/octocat/blank.json', { model: 'claude', message: '空白', art: canvas(C.paper) }),
      /只有 1 种颜色/,
    );
    assert.equal(existsSync(resolve(TMP_DIR, 'blank.json')), false, 'nothing was written');
  });

  it('refuses a model outside the whitelist', () => {
    assert.throws(() => save(TMP_PATH, { model: 'skynet', message: '测试', art: art() }), /不在白名单里/);
  });

  it('accepts a raw pixels array as well as a Canvas', () => {
    const written = save(TMP_PATH, { model: 'gpt', message: '直接传数组', art: art().toPixels() });
    assert.equal(written, TMP_PATH);
  });

  it('rejects a Canvas subclass check by instance, not duck typing', () => {
    assert.ok(canvas() instanceof Canvas);
  });
});
