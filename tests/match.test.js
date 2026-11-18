import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  euclideanDistance,
  closestPerson,
  closestFace,
  overlap,
  clampThreshold,
  DEFAULT_THRESHOLD,
  MIN_THRESHOLD,
  MAX_THRESHOLD,
} from '../src/lib/match.js';

test('euclideanDistance', () => {
  assert.equal(euclideanDistance([0, 0], [3, 4]), 5);
  assert.equal(euclideanDistance(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3])), 0);
});

test('closestPerson picks the nearest photo across all people', () => {
  const people = [
    { name: 'ann', descriptors: [[0, 0], [10, 10]] },
    { name: 'bob', descriptors: [[5, 5]] },
  ];
  assert.deepEqual(closestPerson([9, 9], people), { name: 'ann', distance: Math.SQRT2 });
  assert.equal(closestPerson([4, 5], people).name, 'bob');
});

test('closestPerson returns null when nobody is known', () => {
  assert.equal(closestPerson([1, 2], []), null);
  assert.equal(closestPerson([1, 2], [{ name: 'ann', descriptors: [] }]), null);
});

test('closestFace returns the nearest face whether or not it is within the threshold', () => {
  const faces = [
    { name: 'ann', distance: 0.62 },
    { name: 'bob', distance: 0.58 },
  ];
  assert.deepEqual(closestFace(faces), { name: 'bob', distance: 0.58 });
  assert.equal(closestFace([]), null);
  assert.equal(closestFace(undefined), null);
});

test('overlap measures how much two boxes share', () => {
  const box = { x: 0, y: 0, width: 2, height: 2 };
  assert.equal(overlap(box, box), 1);
  assert.equal(overlap(box, { x: 5, y: 5, width: 2, height: 2 }), 0);
  assert.equal(overlap(box, { x: 2, y: 0, width: 2, height: 2 }), 0); // touching edges
  assert.equal(overlap(box, { x: 1, y: 0, width: 2, height: 2 }), 2 / 6);
});

test('clampThreshold keeps stored values in range', () => {
  assert.equal(clampThreshold(0.5), 0.5);
  assert.equal(clampThreshold('0.42'), 0.42);
  assert.equal(clampThreshold(0), MIN_THRESHOLD);
  assert.equal(clampThreshold(5), MAX_THRESHOLD);
  assert.equal(clampThreshold(undefined), DEFAULT_THRESHOLD);
  assert.equal(clampThreshold('nope'), DEFAULT_THRESHOLD);
});
