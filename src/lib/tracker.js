// Decides when a scan result should mute or unmute the video.
//
//   idle       -> the person is not on screen; sound is untouched
//   muting     -> the person is on screen and we are holding the sound off
//   overridden -> the person is on screen but the viewer turned the sound back
//                 on; leave it alone until the person has left
//
// Recognising someone for the first time is strict: the face must be within
// the match limit. But a face's score wobbles from frame to frame as the person
// moves, talks and turns, and regularly drifts just past the limit while they
// are plainly still there. So once a person has been recognised, it takes less
// to keep them:
//
//   - a slightly looser limit applies (`stayMargin`), and
//   - a face in the same spot as the recognised one still counts, within a
//     looser limit again (`sameSpotMargin`). People do not jump around between
//     checks a fifth of a second apart.
//
// The detector also misses a face outright now and then, so the person only
// counts as gone after `missesToUnmute` checks in a row without them.
//
// A watched name written on screen counts the same as a recognised face.

import { closestFace, overlap } from './match.js';

export const DEFAULT_MISSES_TO_UNMUTE = 2;
export const STAY_MARGIN = 0.08;
export const SAME_SPOT_MARGIN = 0.2;
export const SAME_SPOT_OVERLAP = 0.3;

/**
 * @typedef {{name: string, distance: number, box?: {x: number, y: number, width: number, height: number}}} Face
 * @typedef {'recognised' | 'close enough' | 'same spot' | 'name'} Why
 * @typedef {{name: string, why: Why, face?: Face}} Found who is on screen and how we know
 */

export function createTracker({
  missesToUnmute = DEFAULT_MISSES_TO_UNMUTE,
  stayMargin = STAY_MARGIN,
  sameSpotMargin = SAME_SPOT_MARGIN,
  sameSpotOverlap = SAME_SPOT_OVERLAP,
} = {}) {
  let state = 'idle';
  let misses = 0;
  let lastBox = null; // where the person was the last time we saw them

  /** @returns {Found | null} */
  function findFace(faces, threshold) {
    if (state === 'idle') {
      const face = closestFace(faces);
      return face && face.distance <= threshold ? { name: face.name, face, why: 'recognised' } : null;
    }

    let best = null;
    for (const face of faces ?? []) {
      let why = null;
      if (face.distance <= threshold) why = 'recognised';
      else if (face.distance <= threshold + stayMargin) why = 'close enough';
      else if (
        face.distance <= threshold + sameSpotMargin &&
        lastBox &&
        face.box &&
        overlap(face.box, lastBox) >= sameSpotOverlap
      ) {
        why = 'same spot';
      }
      if (why && (!best || face.distance < best.face.distance)) best = { name: face.name, face, why };
    }
    return best;
  }

  return {
    get state() {
      return state;
    },

    /**
     * Feed what one check saw.
     * @param {Face[]} faces the faces in the frame
     * @param {number} threshold the match limit
     * @param {string | null} [nameOnScreen] a watched name currently written on screen, if any
     * @returns {{action: 'mute' | 'unmute' | null, found: Found | null}}
     *   `action` is what to do to the sound now; `found` is the person, if they are in this frame
     */
    scan(faces, threshold, nameOnScreen = null) {
      const byFace = findFace(faces, threshold);
      if (byFace?.face.box) lastBox = byFace.face.box;
      const found = byFace ?? (nameOnScreen ? { name: nameOnScreen, why: 'name' } : null);

      if (state === 'idle') {
        if (!found) return { action: null, found };
        state = 'muting';
        misses = 0;
        return { action: 'mute', found };
      }

      if (found) {
        misses = 0;
        return { action: null, found };
      }
      misses += 1;
      if (misses < missesToUnmute) return { action: null, found };

      const wasMuting = state === 'muting';
      state = 'idle';
      misses = 0;
      lastBox = null;
      return { action: wasMuting ? 'unmute' : null, found };
    },

    /** The viewer turned the sound back on while we were muting. */
    overridden() {
      if (state === 'muting') state = 'overridden';
    },

    /** A different video was loaded, or scanning stopped. */
    reset() {
      state = 'idle';
      misses = 0;
      lastBox = null;
    },
  };
}
