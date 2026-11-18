// Rewrites the Latin half of README.md from the Cyrillic half.
//
//     pnpm readme
//
// The README is written once, in Cyrillic, between the "cir" markers. This copies
// it letter for letter into Latin between the "lat" markers. Anything in
// `backticks` is left as it is: folder names, and examples that are about the
// script itself.

import { readFile, writeFile } from 'node:fs/promises';
import { toLatin } from '../src/lib/latin.js';

const FILE = new URL('../README.md', import.meta.url);
const CYRILLIC = /<!-- cir:start -->\n([\s\S]*?)\n<!-- cir:end -->/;
const LATIN = /(<!-- lat:start -->\n)[\s\S]*?(<!-- lat:end -->)/;

const readme = await readFile(FILE, 'utf8');
const source = readme.match(CYRILLIC)?.[1];
if (source === undefined || !LATIN.test(readme)) {
  console.error('README.md is missing its cir:start/cir:end or lat:start/lat:end markers.');
  process.exit(1);
}

const latin = source
  .split(/(`[^`\n]*`)/)
  .map((part) => (part.startsWith('`') ? part : toLatin(part)))
  .join('');

const updated = readme.replace(LATIN, (_, start, end) => `${start}${latin}\n${end}`);
if (updated === readme) {
  console.log('README.md: the Latin text is already up to date.');
} else {
  await writeFile(FILE, updated);
  console.log('README.md: the Latin text was rewritten from the Cyrillic text.');
}
