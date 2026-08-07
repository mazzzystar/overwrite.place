import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { verifyArtwork } from '../scripts/lib/artwork.js';
import { checkMessage, containsBlockedTerm, hashTerm, normalize } from '../scripts/lib/moderation.js';

const PATH = 'submissions/octocat/waiting-for-rain.json';

const rows = (fn) => Array.from({ length: 64 }, (_, y) => Array.from({ length: 64 }, (_, x) => fn(x, y)).join(''));

/** A valid artwork: paper background with a charcoal band across the middle. */
const validPixels = rows((_, y) => (y >= 28 && y < 36 ? '1' : '0'));

const make = (overrides = {}) => JSON.stringify({
  version: 1,
  model: 'claude',
  message: '我想画一只正在等雨的猫',
  pixels: validPixels,
  ...overrides,
});

const check = (source, path = PATH) => verifyArtwork(source, path);
const messages = (result) => result.errors.map((e) => e.message).join('\n');
const hints = (result) => result.errors.map((e) => e.hint ?? '').join('\n');

describe('a well-formed submission', () => {
  it('passes', () => {
    const result = check(make());
    assert.equal(result.ok, true, messages(result));
    assert.equal(result.author, 'octocat');
    assert.equal(result.slug, 'waiting-for-rain');
    assert.equal(result.distinctColors, 2);
    assert.equal(result.grid[0][0], 0);
    assert.equal(result.grid[30][10], 1);
  });

  it('warns, but still passes, when the canvas is almost one colour', () => {
    const result = check(make({ pixels: rows((x, y) => (x === 0 && y === 0 ? '4' : '0')) }));
    assert.equal(result.ok, true, messages(result));
    assert.equal(result.warnings.length, 1);
  });
});

describe('pixel grid', () => {
  it('rejects the wrong number of rows', () => {
    const result = check(make({ pixels: validPixels.slice(0, 63) }));
    assert.equal(result.ok, false);
    assert.match(messages(result), /63 行/);
  });

  it('rejects a row of the wrong width', () => {
    const pixels = [...validPixels];
    pixels[7] = pixels[7].slice(0, 63);
    const result = check(make({ pixels }));
    assert.equal(result.ok, false);
    assert.match(messages(result), /pixels\[7\] 有 63 个字符/);
  });

  it('rejects colour indices outside the palette', () => {
    const pixels = [...validPixels];
    pixels[3] = `8${pixels[3].slice(1)}`;
    const result = check(make({ pixels }));
    assert.equal(result.ok, false);
    assert.match(hints(result), /只有 8 种颜色/);
  });

  it('explains itself when given hex colours', () => {
    const pixels = [...validPixels];
    pixels[0] = `#${pixels[0].slice(1)}`;
    assert.match(hints(check(make({ pixels }))), /不是十六进制颜色值/);
  });

  it('explains itself when spaces are used as blanks', () => {
    const pixels = [...validPixels];
    pixels[0] = ` ${pixels[0].slice(1)}`;
    assert.match(hints(check(make({ pixels }))), /纸白是 0/);
  });

  it('names the mistake when pixels is a 2-D array', () => {
    const result = check(make({ pixels: validPixels.map((row) => [...row]) }));
    assert.match(messages(result), /二维数组/);
  });

  it('names the mistake when pixels is a flat number array', () => {
    const result = check(make({ pixels: new Array(4096).fill(0) }));
    assert.match(messages(result), /扁平的数字数组/);
  });

  it('rejects a single-colour canvas', () => {
    const result = check(make({ pixels: rows(() => '0') }));
    assert.equal(result.ok, false);
    assert.match(messages(result), /只有 1 种颜色/);
  });

  it('caps how many broken rows it reports', () => {
    const result = check(make({ pixels: rows(() => 'x') }));
    assert.equal(result.errors.length, 5);
  });
});

describe('fields', () => {
  it('rejects an author field, and says why', () => {
    const result = check(make({ author: 'octocat' }));
    assert.equal(result.ok, false);
    assert.match(hints(result), /作者由文件路径决定/);
  });

  it('rejects a timestamp, and says why', () => {
    assert.match(hints(check(make({ created_at: '2026-08-07' }))), /顺序由合并顺序决定/);
  });

  it('rejects an unknown field', () => {
    assert.match(messages(check(make({ vibes: 'good' }))), /不认识的字段 "vibes"/);
  });

  it('rejects a wrong version', () => {
    assert.match(messages(check(make({ version: 2 }))), /version 必须是数字 1/);
  });

  it('rejects a model outside the whitelist', () => {
    assert.match(messages(check(make({ model: 'skynet' }))), /不在白名单里/);
  });

  it('rejects malformed JSON', () => {
    assert.match(messages(check('{ "version": 1, }')), /JSON 解析失败/);
  });

  it('rejects a file over the size limit', () => {
    const padded = `${make().slice(0, -1)}, "pad": "${'x'.repeat(21_000)}" }`;
    assert.match(messages(check(padded)), /上限是 20480 字节/);
  });
});

describe('message', () => {
  it('rejects an empty message', () => {
    assert.match(messages(check(make({ message: '   ' }))), /不能为空/);
  });

  it('counts code points, not UTF-16 units', () => {
    const sixty = '一二三四五'.repeat(12);
    assert.equal(check(make({ message: sixty })).ok, true);
    assert.match(messages(check(make({ message: `${sixty}六` }))), /61 个字符/);
  });

  it('rejects control characters', () => {
    assert.match(messages(check(make({ message: '正常\u0007文字' }))), /控制字符/);
  });

  it('rejects zero-width and bidi overrides', () => {
    assert.match(messages(check(make({ message: '正常\u202E文字' }))), /零宽或方向控制字符/);
  });

  it('rejects links', () => {
    assert.match(messages(check(make({ message: '看这里 https://spam.example' }))), /不能放链接/);
    assert.match(messages(check(make({ message: '看这里 www.spam.example' }))), /不能放链接/);
  });

  it('rejects email addresses', () => {
    assert.match(messages(check(make({ message: '联系 me@spam.example' }))), /邮箱地址/);
  });

  // The moderation patterns are written for a 60-character caption. Left to run
  // on a multi-megabyte string, the email pattern backtracks quadratically and
  // an oversized message becomes a way to pin a CI runner for hours.
  it('stops at the length check instead of scanning an oversized message', () => {
    const started = Date.now();
    const result = check(make({ message: 'a'.repeat(400_000) }));
    assert.equal(result.ok, false);
    assert.ok(Date.now() - started < 500, `took ${Date.now() - started}ms — moderation ran on it anyway`);
  });

  it('stops at the size check instead of parsing an oversized file', () => {
    const started = Date.now();
    const result = check(`{"version":1,"model":"claude","message":"x","pad":"${'y'.repeat(4_000_000)}"}`);
    assert.equal(result.ok, false);
    assert.match(messages(result), /上限是 20480 字节/);
    assert.ok(Date.now() - started < 500, `took ${Date.now() - started}ms`);
  });

  it('rejects a character repeated to fill the line', () => {
    assert.match(messages(check(make({ message: `啊${'啊'.repeat(20)}` }))), /重复了太多次/);
  });
});

describe('path', () => {
  const bad = (path) => check(make(), path);

  it('rejects a file outside submissions/', () => {
    assert.match(messages(bad('site/octocat/art.json')), /路径必须是 submissions/);
  });

  it('rejects extra nesting', () => {
    assert.match(messages(bad('submissions/octocat/2026/art.json')), /路径必须是 submissions/);
  });

  it('rejects a directory name that is not a valid login', () => {
    assert.match(messages(bad('submissions/not a login/art.json')), /不是一个合法的 GitHub login/);
  });

  it('rejects an uppercase or underscored slug', () => {
    assert.match(messages(bad('submissions/octocat/Waiting_For_Rain.json')), /只能用小写字母/);
  });

  it('rejects a slug over the length limit', () => {
    assert.match(messages(bad(`submissions/octocat/${'a'.repeat(49)}.json`)), /最多 48 个字符/);
  });
});

describe('moderation', () => {
  const data = { salt: 'test-salt', blocked: [hashTerm('badword', 'test-salt')], patterns: [] };

  it('folds leet spelling, spacing and punctuation before matching', () => {
    assert.equal(normalize('B.a.d W0RD'), 'badword');
    // '!' folds to 'i' rather than being dropped — that is what catches sh!t.
    assert.equal(normalize('h! there'), 'hithere');
  });

  it('matches a blocked term embedded in a longer message', () => {
    assert.equal(containsBlockedTerm('前面 b-a-d w0rd 后面', data), true);
  });

  it('leaves innocent text alone', () => {
    assert.equal(containsBlockedTerm('一只正在等雨的猫', data), false);
    assert.equal(containsBlockedTerm('badwor', data), false);
  });

  it('reports the structural rules that fired', () => {
    assert.deepEqual(checkMessage('https://a.example 和 b@c.example'), ['附言里不能放链接', '附言里不能放邮箱地址']);
  });
});
