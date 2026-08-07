import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { buildTimeline } from '../scripts/lib/timeline.js';

/**
 * Numbering and lifespans are the only factual claims this site makes, and both
 * are derived from git history rather than from anything in the files. So these
 * run against real scratch repositories with controlled commit timestamps.
 */

const repos = [];
after(() => { for (const repo of repos) rmSync(repo, { recursive: true, force: true }); });

const PIXELS = Array.from({ length: 64 }, (_, y) => (y < 32 ? '0' : '1').repeat(64));

function newRepo() {
  const root = mkdtempSync(resolve(tmpdir(), 'owp-timeline-'));
  repos.push(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  let clock = 1_700_000_000;

  return {
    root,
    /** Commit an artwork `seconds` after the previous commit. */
    add(author, slug, seconds = 3600) {
      clock += seconds;
      mkdirSync(resolve(root, 'submissions', author), { recursive: true });
      writeFileSync(
        resolve(root, 'submissions', author, `${slug}.json`),
        JSON.stringify({ version: 1, model: 'claude', message: slug, pixels: PIXELS }),
      );
      git('add', `submissions/${author}/${slug}.json`);
      execFileSync('git', ['commit', '-q', '-m', `add ${slug}`], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` },
      });
      return clock;
    },
    remove(author, slug, seconds = 3600) {
      clock += seconds;
      git('rm', '-q', `submissions/${author}/${slug}.json`);
      execFileSync('git', ['commit', '-q', '-m', `remove ${slug}`], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` },
      });
      return clock;
    },
    /** Commit any file, to test what does and does not count as a submission. */
    addLoose(path, contents, seconds = 3600) {
      clock += seconds;
      mkdirSync(resolve(root, path, '..'), { recursive: true });
      writeFileSync(resolve(root, path), contents);
      git('add', path);
      execFileSync('git', ['commit', '-q', '-m', `add ${path}`], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` },
      });
      return clock;
    },
    addBoth(author, slugs, seconds = 3600) {
      clock += seconds;
      mkdirSync(resolve(root, 'submissions', author), { recursive: true });
      for (const slug of slugs) {
        writeFileSync(
          resolve(root, 'submissions', author, `${slug}.json`),
          JSON.stringify({ version: 1, model: 'claude', message: slug, pixels: PIXELS }),
        );
      }
      git('add', '-A');
      execFileSync('git', ['commit', '-q', '-m', 'add two at once'], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` },
      });
      return clock;
    },
    timeline: () => buildTimeline({ root }),
  };
}

const summary = (artworks) => artworks.map((a) => `${a.no}:${a.slug}:${a.life ?? 'alive'}`);

describe('ordering and lifespan', () => {
  it('numbers by merge order and measures each life to the next arrival', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.add('bob', 'two', 600);
    repo.add('carol', 'three', 1800);

    const { artworks } = repo.timeline();
    assert.deepEqual(summary(artworks), ['1:one:600', '2:two:1800', '3:three:alive']);
  });

  it('keeps files added in one commit in a stable order', () => {
    const repo = newRepo();
    repo.addBoth('alice', ['aaa', 'bbb']);
    const first = summary(repo.timeline().artworks);
    assert.deepEqual(first, summary(repo.timeline().artworks), 'two builds of the same repo must agree');
    assert.deepEqual(first.map((s) => s.split(':')[1]), ['aaa', 'bbb']);
  });
});

describe('takedown', () => {
  it('retires the number instead of renumbering what follows', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.add('bob', 'two');
    repo.add('carol', 'three');
    repo.remove('bob', 'two');

    const { artworks, totalEverPosted } = repo.timeline();
    assert.deepEqual(artworks.map((a) => a.no), [1, 3], 'No. 3 must not become No. 2');
    assert.equal(totalEverPosted, 3);
  });

  it('leaves a neighbour’s lifespan alone — it still ended when the next one went up', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.add('bob', 'two', 600);
    repo.add('carol', 'three', 1800);
    repo.remove('bob', 'two');

    const { artworks } = repo.timeline();
    assert.equal(artworks[0].life, 600, 'No. 1 left the wall when No. 2 arrived, removed or not');
  });

  // The regression this file was written for. Removing the artwork that is
  // currently on the homepage is the likeliest moderation action, and it hands
  // the wall back to the one before it.
  it('puts the clock back on the artwork a takedown returns to the wall', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.add('bob', 'two', 600);
    const removedAt = repo.remove('bob', 'two', 1200);

    const { artworks } = repo.timeline();
    assert.equal(artworks.length, 1);
    assert.equal(artworks[0].no, 1);
    assert.equal(artworks[0].life, null, 'it is on the wall again, so it is alive');
    assert.equal(
      artworks[0].aliveSince, removedAt * 1000,
      'the clock restarts at the takedown, so it excludes the time it spent covered',
    );
  });

  it('dates an untouched artwork’s clock from when it went up', () => {
    const repo = newRepo();
    const bornAt = repo.add('alice', 'one');
    const { artworks } = repo.timeline();
    assert.equal(artworks[0].aliveSince, bornAt * 1000);
  });

  it('ignores files under submissions/ that are not artworks', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.add('bob', 'two', 600);
    repo.addLoose('submissions/README.md', '# notes\n', 1200);

    const { artworks, totalEverPosted } = repo.timeline();
    // A stray file must not consume a number, and must not end the live
    // artwork's life — it is not an artwork arriving.
    assert.equal(totalEverPosted, 2);
    assert.deepEqual(artworks.map((a) => a.no), [1, 2]);
    assert.equal(artworks[1].life, null, 'No. 2 is still on the wall');
  });

  it('ignores a nested path that no submission could legally have', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.addLoose('submissions/alice/nested/deep.json', '{}', 600);
    repo.add('bob', 'two', 1800);

    const { artworks } = repo.timeline();
    assert.equal(artworks[0].life, 2400, 'No. 1 ran until No. 2 arrived, not until the nested file did');
    assert.deepEqual(artworks.map((a) => a.no), [1, 2]);
  });

  it('keeps numbering stable when a filename is not ASCII', () => {
    const repo = newRepo();
    repo.add('alice', 'one');
    repo.add('bob', '晨光', 600);
    repo.add('carol', 'three', 1800);

    const first = repo.timeline().artworks;
    assert.deepEqual(first.map((a) => a.no), [1, 2, 3]);
    assert.equal(first[1].slug, '晨光');
    assert.equal(first[0].life, 600);

    // git quotes non-ASCII paths by default; if that leaked through, the file
    // would look uncommitted and its number would move on every build.
    const second = repo.timeline().artworks;
    assert.deepEqual(second.map((a) => a.bornAt), first.map((a) => a.bornAt));
    assert.deepEqual(second.map((a) => a.no), first.map((a) => a.no));
    assert.equal(repo.timeline().uncommitted.length, 0);
  });

  it('restores a re-added artwork to its original number and time', () => {
    const repo = newRepo();
    const originalBirth = repo.add('alice', 'one');
    repo.add('bob', 'two');
    repo.remove('alice', 'one');
    repo.add('alice', 'one');

    const { artworks } = repo.timeline();
    const restored = artworks.find((a) => a.slug === 'one');
    assert.equal(restored.no, 1, 'a file’s first appearance is what it is numbered by');
    assert.equal(restored.bornAt, originalBirth * 1000);
  });
});
