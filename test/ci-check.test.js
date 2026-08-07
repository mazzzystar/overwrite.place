import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ROOT } from '../scripts/lib/config.js';

/**
 * These are the rules that stand between a stranger's pull request and an
 * unreviewed merge, so they are exercised end to end: a real git repository, a
 * real diff, and ci-check.js run as the process CI runs.
 *
 * The scripts are copied into the scratch repository because ci-check resolves
 * its root from its own location — the same reason it can be trusted to run
 * from the base branch when the pull request cannot touch it.
 */

let repo;
let base;

const run = (args) => {
  const result = spawnSync(process.execPath, [resolve(repo, 'scripts/ci-check.js'), ...args], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout + result.stderr };
};

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const commitOn = (branch, write, message = 'change') => {
  git('checkout', '-q', '-B', branch, base);
  write();
  git('add', '-A');
  git('commit', '-q', '-m', message);
  git('checkout', '-q', 'main');
  return branch;
};

const artwork = (message = '一幅测试作品', seed = 0) => JSON.stringify({
  version: 1,
  model: 'claude',
  message,
  pixels: Array.from({ length: 64 }, (_, y) => (y < 20 + seed ? '0' : '4').repeat(64)),
}, null, 2);

before(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'owp-cicheck-'));
  for (const item of ['scripts', 'config.json', 'palette.json', 'blocklist.json', 'moderation.json']) {
    cpSync(resolve(ROOT, item), resolve(repo, item), { recursive: true });
  }
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  const stamp = (seconds) => ({ GIT_AUTHOR_DATE: `${seconds} +0000`, GIT_COMMITTER_DATE: `${seconds} +0000` });
  const commit = (message, seconds) =>
    execFileSync('git', ['commit', '-q', '-m', message], { cwd: repo, env: { ...process.env, ...stamp(seconds) } });

  git('add', '-A');
  commit('scaffold', 1_700_000_000);

  // alice long ago (so her cooldown has expired), bob most recently (so bob owns
  // the wall and alice is not replacing herself).
  mkdirSync(resolve(repo, 'submissions/alice'), { recursive: true });
  writeFileSync(resolve(repo, 'submissions/alice/one.json'), artwork('alice 的作品'));
  git('add', '-A');
  commit('alice', 1_700_000_100);

  mkdirSync(resolve(repo, 'submissions/bob'), { recursive: true });
  writeFileSync(resolve(repo, 'submissions/bob/two.json'), artwork('bob 的作品', 5));
  git('add', '-A');
  commit('bob', 1_700_100_000);

  git('branch', '-M', 'main');
  base = git('rev-parse', 'HEAD').trim();
});

after(() => rmSync(repo, { recursive: true, force: true }));

describe('what the pull request is allowed to contain', () => {
  it('accepts one new artwork from an eligible author', () => {
    const branch = commitOn('good', () =>
      writeFileSync(resolve(repo, 'submissions/alice/three.json'), artwork('新作品', 9)));
    const { code, out } = run(['--author', 'alice', '--base', base, '--head', branch]);
    assert.equal(code, 0, out);
    assert.match(out, /校验通过/);
  });

  // The bypass this file was written for. git leaves a trailing space in a path
  // intact; trimming it made every check read the already-merged file at the
  // trimmed path instead of the blob the pull request actually added.
  it('rejects a path that differs from a real one only by a trailing space', () => {
    const branch = commitOn('trailing', () =>
      writeFileSync(resolve(repo, 'submissions/alice/one.json '), 'NOT JSON AT ALL'));
    const { code, out } = run(['--author', 'alice', '--base', base, '--head', branch]);
    assert.equal(code, 1, out);
    assert.match(out, /不是一个合法的作品路径/);
  });

  it('rejects a leading space, rather than reading it as a submission', () => {
    const branch = commitOn('leading', () => {
      mkdirSync(resolve(repo, ' submissions/alice'), { recursive: true });
      writeFileSync(resolve(repo, ' submissions/alice/one.json'), 'NOT JSON');
    });
    const { code, out } = run(['--author', 'alice', '--base', base, '--head', branch, '--require-kind', 'submission']);
    assert.equal(code, 1, out);
  });

  it('rejects an uppercase filename', () => {
    const branch = commitOn('shouty', () =>
      writeFileSync(resolve(repo, 'submissions/alice/LOUD.json'), artwork()));
    assert.equal(run(['--author', 'alice', '--base', base, '--head', branch]).code, 1);
  });

  it('rejects a pull request that touches anything besides the artwork', () => {
    const branch = commitOn('mixed', () => {
      writeFileSync(resolve(repo, 'submissions/alice/four.json'), artwork('混着改', 3));
      writeFileSync(resolve(repo, 'scripts/render.js'), '// tampered\n');
    });
    const { code, out } = run(['--author', 'alice', '--base', base, '--head', branch]);
    assert.equal(code, 1, out);
    assert.match(out, /只能新增 1 个/);
  });

  it('rejects modifying an artwork that already went up', () => {
    const branch = commitOn('edit', () =>
      writeFileSync(resolve(repo, 'submissions/alice/one.json'), artwork('改过的', 7)));
    const { code, out } = run(['--author', 'alice', '--base', base, '--head', branch]);
    assert.equal(code, 1, out);
    assert.match(out, /只允许新增文件/);
  });
});

describe('who the pull request is from', () => {
  it('rejects a directory that is not the pull request author', () => {
    const branch = commitOn('impostor', () =>
      writeFileSync(resolve(repo, 'submissions/alice/five.json'), artwork('冒名', 2)));
    const { code, out } = run(['--author', 'mallory', '--base', base, '--head', branch]);
    assert.equal(code, 1, out);
    assert.match(out, /但发起这个 PR 的是 @mallory/);
  });

  it('rejects the author whose artwork is currently on the wall', () => {
    const branch = commitOn('selfie', () =>
      writeFileSync(resolve(repo, 'submissions/bob/three.json'), artwork('又是我', 4)));
    const { code, out } = run(['--author', 'bob', '--base', base, '--head', branch]);
    assert.equal(code, 1, out);
    assert.match(out, /不能自己替换自己/);
  });
});

describe('the automated lane', () => {
  it('lets a code-only pull request pass, but never as a submission', () => {
    const branch = commitOn('codepr', () =>
      writeFileSync(resolve(repo, 'scripts/render.js'), '// a legitimate code change\n'));

    const open = run(['--author', 'alice', '--base', base, '--head', branch]);
    assert.equal(open.code, 0, 'a code pull request is not a failure');
    assert.match(open.out, /这是一个代码 PR/);

    // …but the merge queue asks for a submission, and must not merge this.
    const queued = run(['--author', 'alice', '--base', base, '--head', branch, '--require-kind', 'submission']);
    assert.equal(queued.code, 1, 'the queue must refuse to merge a code pull request');
    assert.match(queued.out, /不能走自动合并通道/);
  });
});
