import test from 'node:test';
import assert from 'node:assert/strict';
import { toLatin } from '../src/lib/latin.js';

test('Cyrillic text comes out in Latin, with its accents', () => {
  assert.equal(toLatin('Једног човека мутирај'), 'Jednog čoveka mutiraj');
  assert.equal(toLatin('Још нема слика.'), 'Još nema slika.');
  assert.equal(toLatin('лице није нађено'), 'lice nije nađeno');
  assert.equal(toLatin('Строже'), 'Strože');
  assert.equal(toLatin('ћуп, ђак, жаба, шешир'), 'ćup, đak, žaba, šešir');
});

test('letters that become two Latin letters', () => {
  assert.equal(toLatin('људе, њива, џеп'), 'ljude, njiva, džep');
  assert.equal(toLatin('Препознавање'), 'Prepoznavanje');
});

test('a capital at the start of a word capitalises only the first Latin letter', () => {
  assert.equal(toLatin('Људи'), 'Ljudi');
  assert.equal(toLatin('Њива и Џеп'), 'Njiva i Džep');
  assert.equal(toLatin('Љ'), 'Lj');
});

test('a word in capitals stays in capitals', () => {
  assert.equal(toLatin('ЉУДИ'), 'LJUDI');
  assert.equal(toLatin('ПРЕПОЗНАВАЊЕ'), 'PREPOZNAVANJE');
  assert.equal(toLatin('ПАЊ'), 'PANJ');
});

test('Latin text, numbers and paths are left alone', () => {
  assert.equal(toLatin('Додај слике у images/person/'), 'Dodaj slike u images/person/');
  assert.equal(toLatin('користи JPG, PNG или WebP'), 'koristi JPG, PNG ili WebP');
  assert.equal(toLatin('Пратим 2 особе.'), 'Pratim 2 osobe.');
  assert.equal(toLatin('John Smith'), 'John Smith');
});
