import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parseNames, editDistance, allowedMistakes, findName } from '../src/lib/names.js';

const watch = (value) => parseNames(value);
const found = (text, value) => findName(text, watch(value))?.label ?? null;

test('normalize strips case, accents and punctuation', () => {
  assert.equal(normalize('  Vučković,  JOSÉ-María!\n'), 'vuckovic jose maria');
  assert.equal(normalize(null), '');
});

test('parseNames accepts lines and commas, and drops blanks, duplicates and tiny names', () => {
  const names = watch('John Smith\n\n  jane   doe , JOHN SMITH; Al\nBob');
  assert.deepEqual(
    names.map((n) => n.label),
    ['John Smith', 'jane doe', 'Bob'],
  );
  assert.deepEqual(names[0].words, ['john', 'smith']);
  assert.equal(names[0].compact, 'johnsmith');
  assert.deepEqual(watch(''), []);
  assert.deepEqual(watch(undefined), []);
});

test('Cyrillic and Latin spellings of a name reduce to the same thing', () => {
  assert.equal(normalize('Александар Нешто'), 'aleksandar nesto');
  assert.equal(normalize('Aleksandar Nešto'), 'aleksandar nesto');
  assert.equal(normalize('ЂОКОВИЋ'), normalize('Đoković'));
  assert.equal(normalize('Љубица Џамић'), normalize('Ljubica Džamić'));
});

test('Latin look-alike letters inside a Cyrillic word are read as Cyrillic', () => {
  // Latin A, E, K, C, H, P, T, O mixed in with real Cyrillic letters
  assert.equal(normalize('AЛEKCAHДAP HEШTO'), 'aleksandar nesto');
  // a word with no Cyrillic letters at all is left as Latin
  assert.equal(normalize('HOTEL'), 'hotel');
});

test('finds a Cyrillic name on screen, typed in either script', () => {
  assert.equal(found('ГОСТ: АЛЕКСАНДАР НЕШТО', 'Александар Нешто'), 'Александар Нешто');
  assert.equal(found('ГОСТ: АЛЕКСАНДАР НЕШТО', 'Aleksandar Nešto'), 'Aleksandar Nešto');
  assert.equal(found('Guest: Aleksandar Nesto', 'Александар Нешто'), 'Александар Нешто');
  assert.equal(found('AЛEKCAHДAP HEШTO', 'Александар Нешто'), 'Александар Нешто');
  assert.equal(found('АЛЕКСАНДАР НЕКО', 'Александар Нешто'), null);
});

test('parseNames merges several sources and treats both scripts as the same name', () => {
  const names = watch(['John Smith', 'Александар Нешто']);
  assert.deepEqual(
    parseNames('John Smith\nAleksandar Nesto', ['Александар Нешто', 'Jane Doe'], undefined).map((n) => n.label),
    ['John Smith', 'Aleksandar Nesto', 'Jane Doe'],
  );
  assert.equal(names.length, 2);
});

test('editDistance', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('same', 'same'), 0);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('kitten', 'sitting', 1), Infinity);
  assert.equal(editDistance('smith', 'smyth', 1), 1);
});

test('longer names tolerate more misread letters', () => {
  assert.equal(allowedMistakes(5), 0);
  assert.equal(allowedMistakes(6), 1);
  assert.equal(allowedMistakes(12), 2);
});

test('finds a name in a caption regardless of case and punctuation', () => {
  assert.equal(found('BREAKING NEWS\nJOHN SMITH | Senator', 'John Smith'), 'John Smith');
  assert.equal(found('with: john-smith.', 'John Smith'), 'John Smith');
});

test('reports the words that were read', () => {
  assert.deepEqual(findName('Guest: J0HN SMITH', watch('John Smith')), { label: 'John Smith', read: 'j0hn smith' });
});

test('finds a name with accents typed either way', () => {
  assert.equal(found('VLADIMIR VUCKOVIC', 'Vladimir Vučković'), 'Vladimir Vučković');
  assert.equal(found('Vladimir Vučković', 'vladimir vuckovic'), 'vladimir vuckovic');
});

test('tolerates a misread letter in a longer name', () => {
  assert.equal(found('J0HN SMITH', 'John Smith'), 'John Smith');
  assert.equal(found('JOHN SMlTH', 'John Smith'), 'John Smith');
  assert.equal(found('JOHN SMIT', 'John Smith'), 'John Smith');
});

test('tolerates words glued together or split apart', () => {
  assert.equal(found('JOHNSMITH', 'John Smith'), 'John Smith');
  assert.equal(found('JO HN SMITH', 'John Smith'), 'John Smith');
});

test('a different surname of similar length is not a misreading', () => {
  assert.equal(found('ALEKSANDAR NEKO', 'Aleksandar Nesto'), null);
  assert.equal(found('ALEKSANDAR NESTO', 'Aleksandar Nesto'), 'Aleksandar Nesto');
  assert.equal(found('ALEKSANDER NESTO', 'Aleksandar Nesto'), 'Aleksandar Nesto');
  assert.equal(found('ALEKSANDER NE5TO', 'Aleksandar Nesto'), 'Aleksandar Nesto');
});

test('does not match a different name', () => {
  assert.equal(found('JANE SMITH', 'John Smith'), null);
  assert.equal(found('JOHN SMITHSON', 'John Smith'), null);
  assert.equal(found('some unrelated words here', 'John Smith'), null);
  assert.equal(found('', 'John Smith'), null);
});

test('a short name must be read exactly, as a whole word', () => {
  assert.equal(found('with Bob today', 'Bob'), 'Bob');
  assert.equal(found('with Rob today', 'Bob'), null);
  assert.equal(found('bobsled racing', 'Bob'), null);
});

test('a single-word name does not match inside another word', () => {
  assert.equal(found('the Smithsonian museum', 'Smith'), null);
  assert.equal(found("Smith's house", 'Smith'), 'Smith');
});

test('returns the first watched name that appears', () => {
  assert.equal(found('tonight: JANE DOE', 'John Smith\nJane Doe'), 'Jane Doe');
});

test('nothing is found when no names are watched', () => {
  assert.equal(findName('JOHN SMITH', []), null);
});
