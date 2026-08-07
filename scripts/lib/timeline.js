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

// `root` is a parameter throughout so the timeline can be exercised against a
// scratch repository in tests. Numbering and lifespans are the product's only
// factual claims; they need to be testable against real git history, not mocks.
// core.quotePath=false is not cosmetic. With it on — the default — git renders
// `submissions/bob/晨光.json` as an escaped, quoted string, the path match below
// fails, and the file gets treated as uncommitted: stamped with the current
// time and floated to the end. That silently renumbers every artwork after it,
// on every single build. Numbers appear in links people have already shared.
const git = (args, root = ROOT) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });

// The exact shape a submission may take. `addedTimes` and `listSubmissions`
// have to agree on what counts, or they disagree about how many artworks have
// ever existed — and every entry in that list consumes a number for good. A
// stray README.md or .DS_Store under submissions/ would otherwise burn one and
// freeze the live artwork's clock.
const SUBMISSION_PATH = /^submissions\/[^/]+\/[^/]+\.json$/;

/** A shallow clone has no history to read, which would silently produce a site with no timeline. */
export function isShallowClone(root = ROOT) {
  try {
    return git(['rev-parse', '--is-shallow-repository'], root).trim() === 'true';
  } catch {
    return false;
  }
}

/** Repo-relative paths of every submission currently on disk. */
export function listSubmissions(root = ROOT) {
  const base = resolve(root, 'submissions');
  if (!existsSync(base)) return [];
  const paths = [];
  for (const author of readdirSync(base, { withFileTypes: true })) {
    if (!author.isDirectory()) continue;
    for (const file of readdirSync(resolve(base, author.name), { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = `submissions/${author.name}/${file.name}`;
      if (SUBMISSION_PATH.test(path)) paths.push(path);
    }
  }
  return paths;
}

function logByPath(filter, keep, root = ROOT) {
  const output = git(['log', `--diff-filter=${filter}`, '--format=%H %ct', '--name-only', '--reverse', '--', 'submissions/'], root);
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
    if (seconds === null || !SUBMISSION_PATH.test(line)) continue;
    if (keep === 'first' && times.has(line)) continue;
    times.set(line, { seconds, ordinal: ordinal++ });
  }
  return times;
}

/**
 * path -> { seconds, ordinal } for the commit that added it. `ordinal` keeps
 * files added in the same commit in a stable order, so a build is reproducible.
 *
 * A file taken down and re-added keeps its first appearance: that is when the
 * artwork actually had its turn on the homepage.
 */
export const addedTimes = (root = ROOT) => logByPath('A', 'first', root);

/** path -> when it was last removed. Used to date an artwork's return to the wall. */
export const removedTimes = (root = ROOT) => logByPath('D', 'last', root);

/**
 * Every artwork in order, numbered from 1, with the lifespan each one got.
 * The last entry is the one currently alive and has `life: null` — its clock
 * is still running, so the front end computes it from `bornAt`.
 */
export function buildTimeline({ now = Date.now(), root = ROOT } = {}) {
  const times = addedTimes(root);
  const present = new Set(listSubmissions(root));
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
    const data = JSON.parse(readFileSync(resolve(root, entry.path), 'utf8'));
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

  // Whatever is last on this list is the artwork on the wall right now, so its
  // clock is running whether or not something once covered it. That case is not
  // hypothetical: taking down the artwork currently on the homepage is the most
  // likely moderation action there is, and it hands the wall back to the one
  // before it. Without this, that artwork would carry a frozen lifespan while
  // the homepage ticked a live clock beside it.
  const live = artworks[artworks.length - 1];
  if (live) {
    live.life = null;

    // It may have been on the wall in two stretches. Date the clock from the
    // takedown that gave it back, not from when it first went up, or the number
    // would quietly include the time it spent covered.
    const removed = removedTimes(root);
    const returnedAt = entries
      .slice(live.no)
      .map((entry) => removed.get(entry.path)?.seconds)
      .filter((seconds) => seconds !== undefined);

    live.aliveSince = returnedAt.length > 0 ? Math.max(...returnedAt) * 1000 : live.bornAt;
  }

  return { artworks, uncommitted, totalEverPosted: entries.length };
}
