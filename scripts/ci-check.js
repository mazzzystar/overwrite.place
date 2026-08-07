#!/usr/bin/env node
/**
 * The checks that need repository state, which a contributor cannot run alone:
 * who owns the path, what else the pull request touches, when this author last
 * had a turn, and whether they are trying to replace themselves.
 *
 *   node scripts/ci-check.js --author <login> --base <sha> --head <ref>
 *
 * Always executed from a checkout of the *base* branch. Nothing from the pull
 * request is ever run — only one JSON file is read out of it, as data. That is
 * what makes it safe to run this with write permissions.
 *
 * Writes a markdown report to --report <path> and exits non-zero on rejection.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { ROOT, config, readJson } from './lib/config.js';
import { verifyArtwork } from './lib/artwork.js';
import { addedTimes, buildTimeline } from './lib/timeline.js';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const author = arg('author');
const base = arg('base');
const head = arg('head');
const reportPath = arg('report');

if (!author || !base || !head) {
  console.error('用法：node scripts/ci-check.js --author <login> --base <sha> --head <ref> [--report <path>]');
  process.exit(2);
}

const git = (gitArgs) => execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const problems = [];
const reject = (message, hint) => problems.push({ message, hint });

// ── what does this pull request touch? ──────────────────────────────────────

const changes = git(['diff', '--name-status', `${base}...${head}`])
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [status, ...rest] = line.split('\t');
    return { status: status[0], path: rest[rest.length - 1] };
  });

const touchesSubmissions = changes.some((change) => change.path.startsWith('submissions/'));

// A pull request that changes code is a legitimate thing to open — it just is
// not what this automated lane is for. It passes the status check so it is not
// blocked, but it never earns the `verified` label, so the merge queue will
// not pick it up and a person has to read it.
const kind = touchesSubmissions ? 'submission' : 'code';

let submissionPath = null;

if (changes.length === 0) {
  reject('这个 PR 没有改动任何文件');
} else if (kind === 'submission') {
  if (changes.length > 1) {
    reject(
      `这个 PR 改动了 ${changes.length} 个文件，一幅作品只能新增 1 个`,
      `改动的是：${changes.map((c) => c.path).join('、')}。把代码改动拆成单独的 PR`,
    );
  } else {
    const [change] = changes;
    if (change.status !== 'A') {
      reject(
        `只允许新增文件，这个 PR 是${change.status === 'M' ? '修改' : '删除'} ${change.path}`,
        '已经上线的作品不能改动——它已经有自己的存活时长了',
      );
    } else {
      submissionPath = change.path;
    }
  }
}

// ── ownership, blocklist, throttling ────────────────────────────────────────

if (submissionPath) {
  const [, directory] = submissionPath.split('/');

  if (directory.toLowerCase() !== author.toLowerCase()) {
    reject(
      `目录名是 "${directory}"，但发起这个 PR 的是 @${author}`,
      '目录名必须是你自己的 GitHub login。跑 `gh api user -q .login` 查',
    );
  }

  const blocklist = readJson('blocklist.json');
  if (blocklist.logins.some((login) => login.toLowerCase() === author.toLowerCase())) {
    reject('这个账号已被移出参与名单');
  }

  const source = git(['show', `${head}:${submissionPath}`]);
  const result = verifyArtwork(source, submissionPath);
  for (const error of result.errors) reject(error.message, error.hint);

  // Cooldown and self-replacement both read the merged history, which is why
  // they cannot be checked on a contributor's machine.
  const { artworks } = buildTimeline();
  const current = artworks[artworks.length - 1];

  if (current && current.author.toLowerCase() === author.toLowerCase()) {
    reject(
      '首页现在挂着的就是你的作品，不能自己替换自己',
      '等下一个人先来。这条规则是为了防止一个人连播',
    );
  }

  const cooldownMs = config.queue.authorCooldownHours * 3600_000;
  const mine = [...addedTimes().entries()]
    .filter(([path]) => path.toLowerCase().startsWith(`submissions/${author.toLowerCase()}/`))
    .map(([, record]) => record.seconds * 1000);
  const last = mine.length > 0 ? Math.max(...mine) : null;

  if (last !== null && Date.now() - last < cooldownMs) {
    const waitMinutes = Math.ceil((cooldownMs - (Date.now() - last)) / 60_000);
    reject(
      `距离你上一幅作品还不到 ${config.queue.authorCooldownHours} 小时`,
      `还要等大约 ${Math.floor(waitMinutes / 60)} 小时 ${waitMinutes % 60} 分钟`,
    );
  }
}

// ── report ──────────────────────────────────────────────────────────────────

const passed = problems.length === 0;

const codeReport = [
  '### 🛠 这是一个代码 PR',
  '',
  '它没有改动 `submissions/`，所以不会进入作品合并队列——维护者会单独 review。',
  '',
  '如果你本来是想提交一幅作品，那么它应该**只**新增一个 `submissions/<你的 login>/<slug>.json`。',
].join('\n');

const report = kind === 'code' && passed
  ? codeReport
  : passed
  ? [
      '### ✅ 校验通过',
      '',
      `\`${submissionPath}\` 已进入合并队列。`,
      '',
      `队列每 ${config.queue.mergeIntervalMinutes} 分钟放行一幅，排位见 [队列页](${config.siteUrl}/#queue)。`,
      '合并后你的作品会立刻替换首页，然后开始计时。',
    ].join('\n')
  : [
      '### ❌ 还不能合并',
      '',
      ...problems.flatMap((problem, i) => [
        `${i + 1}. ${problem.message}`,
        ...(problem.hint ? [`   > ${problem.hint}`] : []),
      ]),
      '',
      '改完之后 push 到同一个分支，这里会自动重新校验。',
      '',
      `本地自检：\`node scripts/verify.js ${submissionPath ?? 'submissions/<login>/<slug>.json'}\``,
    ].join('\n');

if (reportPath) writeFileSync(reportPath, `${report}\n`);

// The workflow reads `kind` to decide whether the `verified` label is even on
// the table. Only a submission can earn it — the merge queue merges anything
// carrying that label, so a code pull request must never be given one.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\n`);
}

console.log(report);
process.exit(passed ? 0 : 1);
