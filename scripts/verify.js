#!/usr/bin/env node
/**
 * Verify one submission. Contributors run this before opening a pull request;
 * CI runs the very same script from the main branch. The exit code is the
 * verdict — 0 accepted, 1 rejected.
 *
 *   node scripts/verify.js submissions/<login>/<slug>.json
 *
 * Flags: --json (machine-readable) · --no-art (skip the terminal preview)
 *        --png <path> (write the artwork as an image you can actually look at)
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { ROOT, config } from './lib/config.js';
import { verifyArtwork } from './lib/artwork.js';
import { renderAnsi } from './lib/ansi.js';
import { renderArtwork } from './render.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--png');

const asJson = flags.has('--json');
// An agent cannot read ANSI escapes, and a grid of digits is not something you
// can judge a picture by. Writing a PNG gives it something it can open and look
// at — which is the difference between adjusting a drawing and guessing at it.
const pngIndex = args.indexOf('--png');
const pngPath = pngIndex === -1 ? null : args[pngIndex + 1];
const color = process.stdout.isTTY && !process.env.NO_COLOR && !asJson;
const showArt = process.stdout.isTTY && !process.env.CI && !flags.has('--no-art') && !asJson;

const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => paint('32', t);
const red = (t) => paint('31', t);
const yellow = (t) => paint('33', t);
const dim = (t) => paint('2', t);

if (files.length === 0) {
  console.error('用法：node scripts/verify.js submissions/<login>/<slug>.json');
  process.exit(2);
}

/** Repo-relative, forward-slashed — the form checkPath expects on every platform. */
function toRepoPath(input) {
  const absolute = resolve(process.cwd(), input);
  const rel = relative(ROOT, absolute);
  if (rel.startsWith('..')) return null;
  return rel.split(sep).join('/');
}

const results = [];

for (const file of files) {
  const repoPath = toRepoPath(file);

  if (repoPath === null || !existsSync(resolve(ROOT, repoPath))) {
    results.push({ path: file, ok: false, errors: [{ message: `找不到文件：${file}` }], warnings: [] });
    continue;
  }
  if (statSync(resolve(ROOT, repoPath)).isDirectory()) {
    results.push({ path: repoPath, ok: false, errors: [{ message: `${repoPath} 是一个目录` }], warnings: [] });
    continue;
  }

  const source = readFileSync(resolve(ROOT, repoPath), 'utf8');
  const result = verifyArtwork(source, repoPath);
  results.push({ path: repoPath, ...result });
}

if (asJson) {
  console.log(JSON.stringify(
    results.map(({ path, ok, errors, warnings, author, slug }) => ({ path, ok, errors, warnings, author, slug })),
    null,
    2,
  ));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

for (const result of results) {
  console.log('');

  if (!result.ok) {
    const count = result.errors.length;
    console.log(`  ${red('✗')}  ${result.path}  ${dim(`${count} 个问题`)}`);
    console.log('');
    result.errors.forEach((error, i) => {
      console.log(`     ${String(i + 1).padStart(2)}. ${error.message}`);
      if (error.hint) console.log(`         ${dim(`↳ ${error.hint}`)}`);
    });
    console.log('');
    continue;
  }

  if (pngPath && result.grid) {
    // 8x, because this one exists to be looked at.
    writeFileSync(pngPath, renderArtwork(result.grid, 8));
  }

  console.log(`  ${green('✓')}  ${result.path}`);
  console.log('');
  console.log(`     ${dim('作者')}  @${result.author}`);
  console.log(`     ${dim('模型')}  ${result.artwork.model}`);
  console.log(`     ${dim('附言')}  「${result.artwork.message}」`);
  console.log(`     ${dim('用色')}  ${result.distinctColors} / ${config.canvas.colors} 种`);
  if (pngPath) console.log(`     ${dim('图片')}  ${pngPath}`);

  for (const warning of result.warnings) console.log(`     ${yellow('!')}     ${warning}`);

  if (showArt) {
    console.log('');
    console.log(renderAnsi(result.grid, { indent: '     ' }));
  }
  console.log('');
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
