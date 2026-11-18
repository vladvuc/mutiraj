import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../src/lib/tracker.js';

const LIMIT = 0.5;
const LEFT = { x: 0.1, y: 0.2, width: 0.2, height: 0.3 };
const LEFT_MOVED = { x: 0.13, y: 0.22, width: 0.2, height: 0.3 };
const RIGHT = { x: 0.7, y: 0.2, width: 0.2, height: 0.3 };

const face = (distance, box = LEFT) => ({ name: 'person', distance, box });
const them = [face(0.4)];
const nobody = [];
const stranger = [face(0.8, RIGHT)];

function tracker(options) {
  const t = createTracker({ missesToUnmute: 2, ...options });
  return { scan: (faces) => t.scan(faces, LIMIT).action, why: (faces) => t.scan(faces, LIMIT).found?.why, t };
}

test('mutes the first time the person is seen', () => {
  const { scan, t } = tracker();
  assert.equal(scan(nobody), null);
  assert.equal(scan(stranger), null);
  assert.equal(scan(them), 'mute');
  assert.equal(t.state, 'muting');
});

test('does not ask to mute again while the person stays on screen', () => {
  const { scan } = tracker();
  scan(them);
  assert.equal(scan(them), null);
  assert.equal(scan(them), null);
});

test('unmutes once the person has left', () => {
  const { scan, t } = tracker();
  scan(them);
  assert.equal(scan(nobody), null);
  assert.equal(scan(nobody), 'unmute');
  assert.equal(t.state, 'idle');
});

test('unmutes when the scene cuts to someone else', () => {
  const { scan } = tracker();
  scan(them);
  assert.equal(scan(stranger), null);
  assert.equal(scan(stranger), 'unmute');
});

test('a single missed frame does not unmute', () => {
  const { scan, t } = tracker();
  scan(them);
  assert.equal(scan(nobody), null);
  assert.equal(scan(them), null);
  assert.equal(scan(nobody), null);
  assert.equal(t.state, 'muting');
});

test('mutes again when the person comes back', () => {
  const { scan } = tracker();
  scan(them);
  scan(nobody);
  scan(nobody);
  assert.equal(scan(them), 'mute');
});

test('with missesToUnmute 1 it unmutes on the first frame without the person', () => {
  const { scan } = tracker({ missesToUnmute: 1 });
  scan(them);
  assert.equal(scan(nobody), 'unmute');
});

// --- keeping hold of a person whose score wobbles ----------------------------

test('a score just past the limit does not start a mute', () => {
  const { scan } = tracker();
  assert.equal(scan([face(0.55)]), null);
  assert.equal(scan([face(0.55)]), null);
});

test('a score just past the limit keeps an existing mute', () => {
  const { scan, why, t } = tracker();
  scan(them);
  assert.equal(why([face(0.55, RIGHT)]), 'close enough');
  for (let i = 0; i < 10; i++) assert.equal(scan([face(0.57, RIGHT)]), null);
  assert.equal(t.state, 'muting');
});

test('a face in the same spot keeps the mute even with a poor score', () => {
  const { scan, why, t } = tracker();
  scan(them);
  assert.equal(why([face(0.68, LEFT_MOVED)]), 'same spot');
  for (let i = 0; i < 10; i++) assert.equal(scan([face(0.66, LEFT_MOVED)]), null);
  assert.equal(t.state, 'muting');
});

test('a poor score somewhere else on screen does not keep the mute', () => {
  const { scan } = tracker();
  scan(them);
  assert.equal(scan([face(0.68, RIGHT)]), null);
  assert.equal(scan([face(0.68, RIGHT)]), 'unmute');
});

test('a clearly different face in the same spot does not keep the mute', () => {
  const { scan } = tracker();
  scan(them);
  assert.equal(scan([face(0.8, LEFT)]), null);
  assert.equal(scan([face(0.8, LEFT)]), 'unmute');
});

test('the remembered spot follows the person as they move', () => {
  const { scan, t } = tracker();
  const step = (i) => ({ x: 0.1 + i * 0.05, y: 0.2, width: 0.2, height: 0.3 });
  scan([face(0.4, step(0))]);
  // drifts all the way across the screen, never scoring within the limit again
  for (let i = 1; i <= 10; i++) assert.equal(scan([face(0.66, step(i))]), null);
  assert.equal(t.state, 'muting');
});

test('the remembered spot is forgotten after the person leaves', () => {
  const { scan } = tracker();
  scan(them);
  scan(nobody);
  scan(nobody);
  assert.equal(scan([face(0.66, LEFT)]), null); // same spot, but nobody is being tracked now
});

// --- a name written on screen -------------------------------------------------

test('a watched name on screen mutes even with no face', () => {
  const t = createTracker({ missesToUnmute: 2 });
  const result = t.scan(nobody, LIMIT, 'John Smith');
  assert.equal(result.action, 'mute');
  assert.deepEqual(result.found, { name: 'John Smith', why: 'name' });
});

test('a watched name keeps the mute while the face is not recognised', () => {
  const t = createTracker({ missesToUnmute: 2 });
  t.scan(them, LIMIT);
  for (let i = 0; i < 10; i++) assert.equal(t.scan(stranger, LIMIT, 'John Smith').action, null);
  assert.equal(t.state, 'muting');
});

test('unmutes once both the face and the name are gone', () => {
  const t = createTracker({ missesToUnmute: 2 });
  t.scan(nobody, LIMIT, 'John Smith');
  assert.equal(t.scan(nobody, LIMIT, null).action, null);
  assert.equal(t.scan(nobody, LIMIT, null).action, 'unmute');
});

test('a recognised face is reported ahead of the name', () => {
  const t = createTracker();
  assert.equal(t.scan(them, LIMIT, 'John Smith').found.why, 'recognised');
});

// --- the viewer's own choices ------------------------------------------------

test('leaves the sound alone after the viewer turns it back on, until the person leaves', () => {
  const { scan, t } = tracker();
  scan(them);
  t.overridden();
  assert.equal(scan(them), null);
  assert.equal(scan(nobody), null);
  assert.equal(scan(nobody), null); // gone: nothing to unmute, just re-arm
  assert.equal(t.state, 'idle');
  assert.equal(scan(them), 'mute');
});

test('an override while nothing is muted is ignored', () => {
  const { scan, t } = tracker();
  t.overridden();
  assert.equal(t.state, 'idle');
  assert.equal(scan(them), 'mute');
});

test('a new video starts idle', () => {
  const { scan, t } = tracker();
  scan(them);
  t.reset();
  assert.equal(t.state, 'idle');
  assert.equal(scan(nobody), null);
  assert.equal(scan(them), 'mute');
});
