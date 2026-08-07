#!/usr/bin/env node
/**
 * Maintainer helper for the message filter. Terms are stored as salted hashes,
 * so this is how you add one without the plaintext ever entering the repository.
 *
 *   node scripts/moderation.js add <term> [term...]
 *   node scripts/moderation.js check "<message>"
 *   node scripts/moderation.js list
 *
 * `add` reads terms from stdin when given none, which keeps them out of your
 * shell history:  printf '%s\n' term1 term2 | node scripts/moderation.js add
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib/config.js';
import { checkMessage, hashTerm, normalize } from './lib/moderation.js';

const FILE = resolve(ROOT, 'moderation.json');
const [command, ...rest] = process.argv.slice(2);

const load = () => JSON.parse(readFileSync(FILE, 'utf8'));
const save = (data) => writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

switch (command) {
  case 'add': {
    const terms = rest.length > 0
      ? rest
      : (await readStdin()).split('\n').map((t) => t.trim()).filter(Boolean);

    if (terms.length === 0) {
      console.error('没有要添加的词。用法：node scripts/moderation.js add <term>...');
      process.exit(2);
    }

    const data = load();
    const known = new Set(data.blocked.map((b) => b.h));
    let added = 0;

    for (const term of terms) {
      const normalized = normalize(term);
      if (normalized.length < 2) {
        console.error(`跳过：归一化后 "${normalized}" 太短，会误伤正常附言`);
        continue;
      }
      const entry = hashTerm(term, data.salt);
      if (known.has(entry.h)) continue;
      data.blocked.push(entry);
      known.add(entry.h);
      added++;
    }

    data.blocked.sort((a, b) => a.n - b.n || a.h.localeCompare(b.h));
    save(data);
    console.log(`添加了 ${added} 个词，现在共 ${data.blocked.length} 个。`);
    break;
  }

  case 'check': {
    const message = rest.join(' ') || (await readStdin()).trim();
    if (!message) {
      console.error('用法：node scripts/moderation.js check "<message>"');
      process.exit(2);
    }
    const reasons = checkMessage(message);
    console.log(`归一化后：${normalize(message)}`);
    if (reasons.length === 0) {
      console.log('✓ 通过');
    } else {
      for (const reason of reasons) console.log(`✗ ${reason}`);
      process.exit(1);
    }
    break;
  }

  case 'list': {
    const data = load();
    const byLength = new Map();
    for (const { n } of data.blocked) byLength.set(n, (byLength.get(n) ?? 0) + 1);
    console.log(`${data.blocked.length} 个屏蔽词（只显示长度分布，不还原原文）：`);
    for (const [n, count] of [...byLength].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${String(n).padStart(3)} 字符  ×${count}`);
    }
    console.log(`${data.patterns.length} 条结构规则：`);
    for (const pattern of data.patterns) console.log(`  /${pattern.re}/${pattern.flags}  — ${pattern.why}`);
    break;
  }

  default:
    console.error('用法：node scripts/moderation.js <add|check|list>');
    process.exit(2);
}
