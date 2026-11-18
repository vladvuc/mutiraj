import { clampThreshold, DEFAULT_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD } from './lib/match.js';
import { listPhotoFolders, listNameImages, photosSignature } from './lib/photos.js';

const $ = (id) => document.getElementById(id);
const enabled = $('enabled');
const threshold = $('threshold');
const summary = $('summary');
const people = $('people');
const skipped = $('skipped');
const hint = $('hint');
const rescan = $('rescan');
const verbose = $('verbose');
const textEnabled = $('textEnabled');
const names = $('names');
const nameImages = $('nameImages');
const nameImagesSummary = $('nameImagesSummary');

// --- settings ----------------------------------------------------------------

threshold.min = MIN_THRESHOLD;
threshold.max = MAX_THRESHOLD;

const stored = await chrome.storage.local.get(['enabled', 'threshold', 'verbose', 'textEnabled', 'names']);
enabled.checked = stored.enabled !== false;
threshold.value = clampThreshold(stored.threshold ?? DEFAULT_THRESHOLD);
verbose.checked = stored.verbose === true;
textEnabled.checked = stored.textEnabled === true;
names.value = stored.names ?? '';

enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
textEnabled.addEventListener('change', () => chrome.storage.local.set({ textEnabled: textEnabled.checked }));
names.addEventListener('input', () => chrome.storage.local.set({ names: names.value }));
verbose.addEventListener('change', () => chrome.storage.local.set({ verbose: verbose.checked }));
threshold.addEventListener('input', () => chrome.storage.local.set({ threshold: clampThreshold(threshold.value) }));

// --- photo status ------------------------------------------------------------

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function setSummary(text, tone = '') {
  summary.textContent = text;
  summary.className = tone;
}

function render(status) {
  people.replaceChildren();
  skipped.replaceChildren();
  hint.hidden = true;

  if (status.phase === 'error') {
    setSummary(`Could not start face recognition: ${status.error}`, 'warn');
    return;
  }

  for (const person of status.people) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const count = document.createElement('span');
    name.textContent = person.name;
    count.textContent = person.photos > 0 ? plural(person.photos, 'photo') : 'no usable photos';
    item.append(name, count);
    people.append(item);
  }
  for (const entry of status.skipped) {
    const item = document.createElement('li');
    item.textContent = `Skipped ${entry.file}: ${entry.reason}`;
    skipped.append(item);
  }

  const usable = status.people.filter((p) => p.photos > 0).length;
  if (usable > 0) {
    setSummary(`Watching for ${plural(usable, 'person', 'people')}.`, 'ok');
  } else {
    setSummary('No usable photos yet, so nothing will be muted.', 'warn');
    hint.hidden = false;
  }
}

async function askEngine(message) {
  try {
    return await chrome.runtime.sendMessage({ target: 'engine', ...message });
  } catch {
    return undefined; // engine document is still starting
  }
}

// --- names read from images ---------------------------------------------------

function renderNameImages(results) {
  nameImages.replaceChildren();
  if (results.length === 0) {
    nameImagesSummary.replaceChildren(
      'Or put a picture of the name in the ',
      Object.assign(document.createElement('code'), { textContent: 'names/' }),
      ' folder and press Rescan.',
    );
    return;
  }
  nameImagesSummary.textContent = 'Read from the pictures in the names/ folder:';
  for (const result of results) {
    const item = document.createElement('li');
    if (result.names.length > 0) {
      item.textContent = `${result.names.join(', ')} (${result.file})`;
    } else {
      item.textContent = `${result.file}: ${result.problem}`;
      item.className = 'problem';
    }
    nameImages.append(item);
  }
}

/** Read the names in the names/ folder, unless nothing there has changed since last time. */
async function syncNameImages({ force = false } = {}) {
  const files = await listNameImages();
  const signature = photosSignature(files);
  const saved = await chrome.storage.local.get(['nameImages', 'nameImagesSignature']);
  if (!force && saved.nameImagesSignature === signature && saved.nameImages) {
    renderNameImages(saved.nameImages);
    return;
  }

  let results = [];
  if (files.length > 0) {
    nameImagesSummary.textContent = 'Reading the pictures in the names/ folder…';
    results = await askEngine({ type: 'read-name-images', files });
    if (!Array.isArray(results)) {
      nameImagesSummary.textContent = 'Could not read the pictures in the names/ folder. Press Rescan to try again.';
      return;
    }
  }
  await chrome.storage.local.set({
    nameImages: results,
    nameImagesSignature: signature,
    imageNames: results.flatMap((result) => result.names),
  });
  renderNameImages(results);
}

/** Bring the engine in line with what is in the photos folder right now. */
async function sync({ force = false } = {}) {
  const forceNames = force;
  setSummary('Reading photos…');
  const photos = await listPhotoFolders();
  const signature = photosSignature(photos);
  await chrome.storage.local.set({ photos });
  await chrome.runtime.sendMessage({ target: 'background', type: 'ensure-engine' }).catch(() => {});

  // The engine takes a moment to load its models the first time.
  for (let attempt = 0; attempt < 60; attempt++) {
    let status = await askEngine({ type: 'status' });
    if (status && status.phase !== 'loading') {
      if (force || status.signature !== signature) {
        force = false;
        status = await askEngine({ type: 'rescan', photos });
      }
      if (status && status.phase !== 'loading') {
        render(status);
        await syncNameImages({ force: forceNames });
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  setSummary('Face recognition is taking too long to start. Try reloading the extension.', 'warn');
}

rescan.addEventListener('click', async () => {
  rescan.disabled = true;
  await sync({ force: true });
  rescan.disabled = false;
});

sync();
