// Face descriptors are 128-number vectors; two photos of the same person land
// close together. Distance below the threshold counts as the same person.

export const DEFAULT_THRESHOLD = 0.5;
export const MIN_THRESHOLD = 0.35;
export const MAX_THRESHOLD = 0.65;

export function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Closest known person to a descriptor.
 * @param {ArrayLike<number>} descriptor
 * @param {{name: string, descriptors: ArrayLike<number>[]}[]} people
 * @returns {{name: string, distance: number} | null}
 */
export function closestPerson(descriptor, people) {
  let best = null;
  for (const person of people) {
    for (const known of person.descriptors) {
      const distance = euclideanDistance(descriptor, known);
      if (!best || distance < best.distance) best = { name: person.name, distance };
    }
  }
  return best;
}

/**
 * Of the faces found in a frame, the one closest to a known person.
 * @param {{name: string, distance: number}[]} faces
 * @returns {{name: string, distance: number} | null}
 */
export function closestFace(faces) {
  let best = null;
  for (const face of faces ?? []) {
    if (!best || face.distance < best.distance) best = face;
  }
  return best;
}

/**
 * How much two boxes cover the same area: 0 = not at all, 1 = identical.
 * @param {{x: number, y: number, width: number, height: number}} a
 * @param {{x: number, y: number, width: number, height: number}} b
 */
export function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  const shared = width * height;
  return shared / (a.width * a.height + b.width * b.height - shared);
}

export function clampThreshold(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, n));
}
