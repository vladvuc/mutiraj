// Finds watched names in text read off a video frame.
//
// Text read from video is messy: mixed case, stray punctuation, and the odd
// wrong or missing letter. So both the watched names and the text on screen are
// reduced to the same plain form before comparing, and longer names are allowed
// a small number of wrong letters.
//
// The plain form is lowercase Latin letters without accents. Cyrillic is
// converted letter by letter (Serbian rules), so a name typed in either script
// matches the same name written on screen in either script:
// "Александар Нешто" and "Aleksandar Nešto" both become "aleksandar nesto".

export const MIN_NAME_LENGTH = 3;

const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
  // letters from other Cyrillic alphabets
  щ: 'sc', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja', і: 'i', є: 'e', ґ: 'g',
};

// Latin letters that look the same as a Cyrillic one, at least in capitals.
// A text reader working on Cyrillic regularly returns these instead ("НЕШТО"
// comes back as "HEШTO"), so inside a word that has Cyrillic letters they are
// taken to be the Cyrillic letter they look like.
const LOOKS_LIKE_CYRILLIC = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', j: 'ј', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
};

const CYRILLIC = /[Ѐ-ӿ]/;

function plainWord(word) {
  if (!CYRILLIC.test(word)) return word;
  let out = '';
  for (const letter of word) {
    const cyrillic = LOOKS_LIKE_CYRILLIC[letter] ?? letter;
    out += CYRILLIC_TO_LATIN[cyrillic] ?? cyrillic;
  }
  return out;
}

/** The plain words in a piece of text: lowercase, no accents, no punctuation, Cyrillic as Latin. */
export function plainWords(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .split(/[^\p{L}\p{N}]+/u)
    .map(plainWord)
    .filter(Boolean);
}

/** The plain form of a piece of text, as one string. */
export function normalize(text) {
  return plainWords(text).join(' ');
}

/**
 * Turn a list of names (one per line, or comma separated) into something to search for.
 * Accepts several sources, for example what was typed plus what was read from images.
 * @param {...(string | string[] | null | undefined)} sources
 * @returns {{label: string, words: string[], compact: string}[]}
 */
export function parseNames(...sources) {
  const names = [];
  const seen = new Set();
  for (const part of sources.flat().join('\n').split(/[\n,;]+/)) {
    const label = part.trim().replace(/\s+/g, ' ');
    const words = plainWords(label);
    const compact = words.join('');
    if (compact.length < MIN_NAME_LENGTH || seen.has(compact)) continue;
    seen.add(compact);
    names.push({ label, words, compact });
  }
  return names;
}

/** How many wrong letters a whole name of this length may have and still count. */
export function allowedMistakes(length) {
  if (length < 6) return 0;
  if (length < 12) return 1;
  return 2;
}

// However long the whole name is, one word may not soak up all the mistakes:
// "Neko" is a different surname from "Nesto", not a misreading of it.
function allowedMistakesInWord(length) {
  return length < 8 ? 1 : 2;
}

/** Do these words on screen spell this name, word for word, within the allowed mistakes? */
function matchesWordForWord(run, name, mistakes) {
  let total = 0;
  for (let i = 0; i < name.words.length; i++) {
    const allowed = Math.min(mistakes - total, allowedMistakesInWord(name.words[i].length));
    total += editDistance(run[i], name.words[i], allowed);
    if (total > mistakes) return false;
  }
  return true;
}

/** Number of single-letter edits to turn `a` into `b`, or Infinity once it exceeds `max`. */
export function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > max) return Infinity;
    previous = current;
  }
  return previous[b.length] <= max ? previous[b.length] : Infinity;
}

/**
 * The first watched name that appears in the text, as whole words.
 * @param {string} text text read from a frame
 * @param {{label: string, words: string[], compact: string}[]} names from parseNames()
 * @returns {{label: string, read: string} | null} the name, and the (plain) words on screen that matched it
 */
export function findName(text, names) {
  const words = plainWords(text);
  if (words.length === 0) return null;

  for (const name of names) {
    const mistakes = allowedMistakes(name.compact.length);
    const count = name.words.length;
    // The reader sometimes glues words together or splits one in two, so as
    // well as runs of the same number of words, try one fewer and one more,
    // compared with the spaces taken out (and at most one wrong letter).
    const glued = Math.min(mistakes, 1);
    for (let size = Math.max(1, count - 1); size <= count + 1; size++) {
      for (let start = 0; start + size <= words.length; start++) {
        const run = words.slice(start, start + size);
        const matches =
          (size === count && matchesWordForWord(run, name, mistakes)) ||
          editDistance(run.join(''), name.compact, glued) <= glued;
        if (matches) return { label: name.label, read: run.join(' ') };
      }
    }
  }
  return null;
}
