import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const readJson = (relPath) => JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf8'));

export const config = readJson('config.json');
export const palette = readJson('palette.json');
