import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './config.js';
import { toGrid } from './artwork.js';

/**
 * When each artwork went up, and therefore how long it lived.
 *
 * The single source of truth is the commit that *added* the file. Nothing in
 * the artwork itself carries a timestamp, so an author cannot claim a position
 * in the sequence or inflate their own lifespan — the ordering is whatever git
 * recorded, and git recorded it when the merge queue merged them.
 */

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** A shallow clone has no history to read, which would silently produce a site with no timeline. */
export function isShallowClone() {
  try {
    return git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
  } catch {
    return false;
  }
}

/** Repo-relative paths of every submission currently on disk. */
export function listSubmissions() {
  const root = resolve(ROOT, 'submissions');
  if (!existsSync(root)) return [];
  const paths = [];
  for (const author of readdirSync(root, { withFileTypes: true })) {
    if (!author.isDirectory()) continue;
    for (const file of readdirSync(resolve(root, author.name), { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.json')) paths.push(`submissions/${author.name}/${file.name}`);
    }
  }
  return paths;
}

/**
 * path -> { seconds, ordinal } for the commit that added it. `ordinal` keeps
 * files added in the same commit in a stable order, so a build is reproducible.
 */
export function addedTimes() {
  const output = git(['log', '--diff-filter=A', '--format=%H %ct', '--name-only', '--reverse', '--', 'submissions/']);
  const times = new Map();
  let seconds = null;
  let ordinal = 0;

  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const header = /^([0-9a-f]{7,40}) (\d+)$/.exec(line);
    if (header) {
      seconds = Number(header[2]);
      continue;
    }
    // A file taken down and re-added keeps its first appearance: that is when
    // the artwork actually had its turn on the homepage.
    if (seconds !== null && line.startsWith('submissions/') && !times.has(line)) {
      times.set(line, { seconds, ordinal: ordinal++ });
    }
  }
  return times;
}

/**
 * Every artwork in order, numbered from 1, with the lifespan each one got.
 * The last entry is the one currently alive and has `life: null` — its clock
 * is still running, so the front end computes it from `bornAt`.
 */
export function buildTimeline({ now = Date.now() } = {}) {
  const times = addedTimes();
  const present = new Set(listSubmissions());
  const uncommitted = [...present].filter((path) => !times.has(path));

  // Number over everything ever added, including artworks since taken down, so
  // a takedown leaves a gap instead of renumbering every artwork after it.
  // Numbers appear in permalinks and in links people have already shared; they
  // have to mean the same thing forever.
  const entries = [...times.entries()].map(([path, record]) => ({ path, ...record }));

  for (const path of uncommitted) {
    // Not committed yet — local development. Sort it last, where it will land.
    entries.push({ path, seconds: Math.floor(now / 1000), ordinal: Number.MAX_SAFE_INTEGER });
  }

  entries.sort((a, b) => a.seconds - b.seconds || a.ordinal - b.ordinal || a.path.localeCompare(b.path));

  const artworks = [];
  entries.forEach((entry, index) => {
    const no = index + 1;
    if (!present.has(entry.path)) return; // taken down; its number stays retired
    const [, author, filename] = entry.path.split('/');
    const data = JSON.parse(readFileSync(resolve(ROOT, entry.path), 'utf8'));
    artworks.push({
      no,
      path: entry.path,
      author,
      slug: filename.replace(/\.json$/, ''),
      model: data.model,
      message: data.message,
      pixels: data.pixels,
      grid: toGrid(data.pixels),
      bornAt: entry.seconds * 1000,
      life: null,
    });
  });

  // Lifespan runs until the next artwork went up — including one that has since
  // been taken down, because that is still when this one left the homepage.
  for (let i = 0; i < artworks.length; i++) {
    const nextEntry = entries[artworks[i].no]; // entries is 0-based, no is 1-based
    if (nextEntry) artworks[i].life = Math.round(nextEntry.seconds - artworks[i].bornAt / 1000);
  }

  return { artworks, uncommitted, totalEverPosted: entries.length };
}
