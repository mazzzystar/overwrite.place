import { createHash } from 'node:crypto';
import { readJson } from './config.js';

export const moderation = readJson('moderation.json');

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const ALNUM = /[\p{L}\p{N}]/u;

/**
 * Fold a message down to the form terms are matched against: lowercase, leet
 * characters spelled out, everything that is not a letter or digit removed. So
 * "f.r.e.e  M0NEY!!" and "freemoney" collapse to the same string.
 */
export function normalize(text) {
  let out = '';
  for (const ch of String(text).toLowerCase()) {
    const folded = LEET[ch] ?? ch;
    if (ALNUM.test(folded)) out += folded;
  }
  return out;
}

const digest = (salt, normalized) => createHash('sha256').update(salt + normalized).digest('hex');

/** Hash a plaintext term the way `blocked` entries in moderation.json are stored. */
export function hashTerm(term, salt = moderation.salt) {
  const normalized = normalize(term);
  return { n: normalized.length, h: digest(salt, normalized) };
}

/**
 * Slide a window of every stored term length across the normalized message.
 * Matching on the folded form is what lets a short list catch spaced-out and
 * embedded spellings without flagging innocent words that merely contain them.
 */
export function containsBlockedTerm(message, data = moderation) {
  const normalized = normalize(message);
  const hashes = new Set(data.blocked.map((b) => b.h));
  const lengths = [...new Set(data.blocked.map((b) => b.n))];

  for (const n of lengths) {
    for (let i = 0; i + n <= normalized.length; i++) {
      if (hashes.has(digest(data.salt, normalized.slice(i, i + n)))) return true;
    }
  }
  return false;
}

/** Returns a list of human-readable reasons the message is not acceptable. */
export function checkMessage(message, data = moderation) {
  const reasons = [];
  for (const pattern of data.patterns) {
    if (new RegExp(pattern.re, pattern.flags).test(message)) reasons.push(pattern.why);
  }
  if (containsBlockedTerm(message, data)) reasons.push('附言里包含被屏蔽的词');
  return [...new Set(reasons)];
}
