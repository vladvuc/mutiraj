// Recognition engine (offscreen document).
//
// Faces: it learns each person's face from the photos in images/<name>/.
// Content scripts then send it video frames and get back, for each face in the
// frame, the closest known person and how close the match is.
//
// Text: content scripts can also ask it to read the text in a frame.

import * as faceapi from '../vendor/face-api/face-api.esm.js';
import Tesseract from '../vendor/tesseract/tesseract.esm.min.js';
import { closestPerson } from './lib/match.js';
import { photosSignature } from './lib/photos.js';

// Root-relative on purpose: face-api's URL handling breaks chrome-extension:// URLs.
const MODEL_URL = '/vendor/face-api/model';
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
const MAX_PHOTO_SIDE = 1600;

// Reference photos: only accept confident detections, so we learn real faces.
const photoDetector = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
// Video frames: accept weaker detections too, otherwise faces in group shots are
// missed. A false detection costs nothing, since it will not match anyone.
const frameDetector = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

/**
 * @type {{
 *   phase: 'loading' | 'ready' | 'error',
 *   error: string | null,
 *   signature: string | null,
 *   people: {name: string, descriptors: Float32Array[]}[],
 *   skipped: {file: string, reason: string}[],
 * }}
 */
const state = { phase: 'loading', error: null, signature: null, people: [], skipped: [] };

let modelsLoaded = null;
let queue = Promise.resolve();

function loadModels() {
  modelsLoaded ??= Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  return modelsLoaded;
}

// --- learning faces ----------------------------------------------------------

async function toCanvas(blob, maxSide = Infinity) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function withMargin(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width * 2;
  canvas.height = source.height * 2;
  const context = canvas.getContext('2d');
  context.fillStyle = '#808080';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, source.width / 2, source.height / 2);
  return canvas;
}

function describeFaces(canvas, detector) {
  return faceapi.detectAllFaces(canvas, detector).withFaceLandmarks().withFaceDescriptors();
}

async function learnPhoto(folder, file) {
  const response = await fetch(`/images/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`).catch(() => null);
  if (!response?.ok) throw new Error('file is no longer there');

  let canvas;
  try {
    canvas = await toCanvas(await response.blob(), MAX_PHOTO_SIDE);
  } catch {
    throw new Error('could not open this image');
  }
  let faces = await describeFaces(canvas, photoDetector);
  // The detector needs some room around a face, so a tightly cropped headshot
  // finds nothing. Try again with a margin added.
  if (faces.length === 0) faces = await describeFaces(withMargin(canvas), photoDetector);
  if (faces.length === 0) throw new Error('no face found');
  // A reference photo should show one person; if there are several, take the biggest.
  faces.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return faces[0].descriptor;
}

async function storedPhotos() {
  const reply = await chrome.runtime.sendMessage({ target: 'background', type: 'get-photos' }).catch(() => null);
  return reply?.photos ?? null;
}

/** @param {{name: string, files: {name: string}[]}[] | undefined} photos list from the popup; omitted = use the stored one */
async function learn(photos) {
  state.phase = 'loading';
  state.error = null;
  try {
    await loadModels();
    photos ??= await storedPhotos();

    const people = [];
    const skipped = [];
    for (const folder of photos ?? []) {
      const descriptors = [];
      for (const file of folder.files) {
        const label = `${folder.name}/${file.name}`;
        if (!PHOTO_EXTENSIONS.test(file.name)) {
          skipped.push({ file: label, reason: 'unsupported format (use JPG, PNG or WebP)' });
          continue;
        }
        try {
          descriptors.push(await learnPhoto(folder.name, file.name));
        } catch (error) {
          skipped.push({ file: label, reason: error.message });
        }
      }
      people.push({ name: folder.name, descriptors });
    }
    state.people = people;
    state.skipped = skipped;
    state.signature = photos ? photosSignature(photos) : null;
    state.phase = 'ready';
  } catch (error) {
    console.error('[mute-face] engine failed to start', error);
    state.phase = 'error';
    state.error = String(error?.message ?? error);
  }
}

function rescan(photos) {
  queue = queue.then(() => learn(photos));
  return queue;
}

function status() {
  return {
    phase: state.phase,
    error: state.error,
    signature: state.signature,
    people: state.people.map((p) => ({ name: p.name, photos: p.descriptors.length })),
    skipped: state.skipped,
  };
}

// --- matching video frames ---------------------------------------------------

async function detect(imageDataUrl) {
  if (state.phase !== 'ready') return { ready: false };
  const known = state.people.filter((p) => p.descriptors.length > 0);
  if (known.length === 0) return { ready: true, known: 0, faces: [] };

  const canvas = await toCanvas(await (await fetch(imageDataUrl)).blob());
  const found = await describeFaces(canvas, frameDetector);
  // Box positions are fractions of the frame, so they stay comparable if the video size changes.
  const faces = found.map((face) => {
    const { x, y, width, height } = face.detection.box;
    return {
      ...closestPerson(face.descriptor, known),
      box: { x: x / canvas.width, y: y / canvas.height, width: width / canvas.width, height: height / canvas.height },
    };
  });
  return { ready: true, known: known.length, faces };
}

// --- reading text in video frames ---------------------------------------------

// English covers Latin letters, Serbian covers Cyrillic. Must match scripts/vendor.mjs.
const READ_LANGUAGES = ['eng', 'srp'];
const SMALL_IMAGE_HEIGHT = 200; // name images shorter than this are enlarged before reading

let reader = null;

/** Starts the text reader the first time it is needed; it runs in its own worker thread. */
function loadReader() {
  reader ??= Tesseract.createWorker(READ_LANGUAGES, Tesseract.OEM.LSTM_ONLY, {
    workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('vendor/tesseract/core'),
    langPath: chrome.runtime.getURL('vendor/tesseract/lang'),
    workerBlobURL: false, // extensions may not run workers from blob: URLs
    cacheMethod: 'none', // the language file is already local
  })
    .then(async (worker) => {
      // "Sparse text": find text wherever it is, in no particular order. Right
      // for captions and title cards scattered over a picture.
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
      return worker;
    })
    .catch((error) => {
      reader = null; // try again on the next request
      throw error;
    });
  return reader;
}

async function readText(imageDataUrl) {
  const worker = await loadReader();
  const { data } = await worker.recognize(imageDataUrl);
  return { text: data.text ?? '' };
}

/**
 * Read the names written in the images in names/.
 * @param {{name: string}[]} files list from the popup
 * @returns {Promise<{file: string, names: string[], problem?: string}[]>}
 */
async function readNameImages(files) {
  const worker = await loadReader();
  const results = [];
  for (const file of files ?? []) {
    if (!PHOTO_EXTENSIONS.test(file.name)) {
      results.push({ file: file.name, names: [], problem: 'unsupported format (use JPG, PNG or WebP)' });
      continue;
    }
    try {
      const response = await fetch(`/names/${encodeURIComponent(file.name)}`);
      const original = await toCanvas(await response.blob(), MAX_PHOTO_SIDE);
      // A tight crop of a caption is only a few dozen pixels tall, too small to read well.
      const scale = Math.min(4, Math.max(1, SMALL_IMAGE_HEIGHT / original.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(original.width * scale);
      canvas.height = Math.round(original.height * scale);
      canvas.getContext('2d').drawImage(original, 0, 0, canvas.width, canvas.height);

      const { data } = await worker.recognize(canvas);
      // Each line of text in the image is one name.
      const names = (data.text ?? '')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => /\p{L}{3}/u.test(line));
      results.push(names.length > 0 ? { file: file.name, names } : { file: file.name, names, problem: 'no text could be read' });
    } catch {
      results.push({ file: file.name, names: [], problem: 'could not open this image' });
    }
  }
  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'engine') return undefined;

  const reply = (work) => {
    Promise.resolve()
      .then(work)
      .then(sendResponse, (error) => sendResponse({ error: String(error?.message ?? error) }));
    return true;
  };

  if (message.type === 'detect') return reply(() => detect(message.image));
  if (message.type === 'read-text') return reply(() => readText(message.image));
  if (message.type === 'read-name-images') return reply(() => readNameImages(message.files));
  if (message.type === 'status') return reply(status);
  if (message.type === 'rescan') return reply(() => rescan(message.photos).then(status));
  return undefined;
});

rescan();
