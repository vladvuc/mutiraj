import test from 'node:test';
import assert from 'node:assert/strict';
import { plural } from '../src/lib/plural.js';

const photos = (n) => plural(n, 'слика', 'слике', 'слика');
const people = (n) => plural(n, 'особу', 'особе', 'особа');

test('one uses the singular form', () => {
  assert.equal(people(1), '1 особу');
  assert.equal(people(21), '21 особу');
  assert.equal(people(101), '101 особу');
});

test('two to four use the "few" form', () => {
  assert.equal(people(2), '2 особе');
  assert.equal(photos(4), '4 слике');
  assert.equal(people(23), '23 особе');
});

test('five and up, and zero, use the "many" form', () => {
  assert.equal(people(0), '0 особа');
  assert.equal(people(5), '5 особа');
  assert.equal(people(20), '20 особа');
});

test('eleven to fourteen use the "many" form, not the one their last digit suggests', () => {
  assert.equal(people(11), '11 особа');
  assert.equal(people(12), '12 особа');
  assert.equal(people(14), '14 особа');
  assert.equal(people(111), '111 особа');
  assert.equal(people(112), '112 особа');
});
