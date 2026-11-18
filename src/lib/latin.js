// The extension's text is written in Serbian Cyrillic. For people who read
// Serbian in Latin script the same text is shown letter for letter in Latin.

const LETTERS = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
}; // prettier-ignore

function isCapital(letter) {
  return letter !== undefined && letter !== letter.toLowerCase();
}

/** Serbian Cyrillic text in Serbian Latin. Anything that is not Serbian Cyrillic is left as it is. */
export function toLatin(text) {
  const source = String(text);
  return source.replace(/[Ѐ-ӿ]/g, (letter, index) => {
    const lower = letter.toLowerCase();
    const latin = LETTERS[lower];
    if (latin === undefined) return letter;
    if (letter === lower) return latin;
    if (latin.length === 1) return latin.toUpperCase();
    // Љ, Њ and Џ become two letters: "Lj" at the start of a word, "LJ" inside one written in capitals.
    const next = source[index + 1];
    const inCapitals = isCapital(next) || (!/\p{L}/u.test(next ?? '') && isCapital(source[index - 1]));
    return inCapitals ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
  });
}
