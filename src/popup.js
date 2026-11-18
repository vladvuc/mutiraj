import { clampThreshold, DEFAULT_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD } from './lib/match.js';
import { listPhotoFolders, listNameImages, photosSignature } from './lib/photos.js';
import { plural } from './lib/plural.js';
import { toLatin } from './lib/latin.js';

const $ = (id) => document.getElementById(id);
const enabled = $('enabled');
const threshold = $('threshold');
const summary = $('summary');
const people = $('people');
const skipped = $('skipped');
const hint = $('hint');
const rescan = $('rescan');
const textEnabled = $('textEnabled');
const names = $('names');
const nameImages = $('nameImages');
const nameImagesStatus = $('nameImagesStatus');
const languageButtons = [...document.querySelectorAll('[data-lang]')];

// --- language ----------------------------------------------------------------

// All text is written in Cyrillic. In Latin mode it is shown letter for letter in
// Latin. Things the person typed or named themselves are never changed.
let latin = false;
const t = (text) => (latin ? toLatin(text) : text);

const fixed = []; // text that is in the page from the start: [original, how to put it back]
const live = new Map(); // text set later: element -> function that gives its text

function collectFixedText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue.trim() || node.parentElement.closest('[data-keep]')) continue;
    fixed.push([node.nodeValue, (text) => (node.nodeValue = text)]);
  }
  for (const element of document.querySelectorAll('[title], [aria-label]')) {
    if (element.closest('[data-keep]')) continue;
    for (const attribute of ['title', 'aria-label']) {
      if (element.hasAttribute(attribute)) {
        fixed.push([element.getAttribute(attribute), (text) => element.setAttribute(attribute, text)]);
      }
    }
  }
  fixed.push([document.title, (text) => (document.title = text)]);
}

/** Put text in an element so that it follows the chosen script. */
function show(element, text) {
  live.set(element, text);
  element.textContent = text();
}

function setLanguage(language) {
  latin = language === 'lat';
  document.documentElement.lang = latin ? 'sr-Latn' : 'sr-Cyrl';
  for (const button of languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === (latin ? 'lat' : 'cir')));
  }
  for (const [original, apply] of fixed) apply(t(original));
  for (const [element, text] of live) {
    if (element.isConnected) element.textContent = text();
    else live.delete(element);
  }
}

collectFixedText();

// --- settings ----------------------------------------------------------------

threshold.min = MIN_THRESHOLD;
threshold.max = MAX_THRESHOLD;

const stored = await chrome.storage.local.get(['enabled', 'threshold', 'textEnabled', 'names', 'lang']);
enabled.checked = stored.enabled !== false;
threshold.value = clampThreshold(stored.threshold ?? DEFAULT_THRESHOLD);
textEnabled.checked = stored.textEnabled === true;
names.value = stored.names ?? '';
setLanguage(stored.lang);

enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
textEnabled.addEventListener('change', () => chrome.storage.local.set({ textEnabled: textEnabled.checked }));
names.addEventListener('input', () => chrome.storage.local.set({ names: names.value }));
threshold.addEventListener('input', () => chrome.storage.local.set({ threshold: clampThreshold(threshold.value) }));
for (const button of languageButtons) {
  button.addEventListener('click', () => {
    setLanguage(button.dataset.lang);
    chrome.storage.local.set({ lang: button.dataset.lang });
  });
}

// --- photo status ------------------------------------------------------------

function setSummary(text, tone = '') {
  show(summary, text);
  summary.className = tone;
}

function render(status) {
  people.replaceChildren();
  skipped.replaceChildren();
  hint.hidden = true;

  if (status.phase === 'error') {
    setSummary(() => `${t('Покретање није успело')}: ${status.error}`, 'warn');
    return;
  }

  for (const person of status.people) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const count = document.createElement('span');
    name.textContent = person.name;
    show(count, () => t(person.photos > 0 ? plural(person.photos, 'слика', 'слике', 'слика') : 'лице није нађено'));
    item.append(name, count);
    people.append(item);
  }
  for (const entry of status.skipped) {
    const item = document.createElement('li');
    show(item, () => `${t('Прескочено')} ${entry.file}: ${t(entry.reason)}`);
    skipped.append(item);
  }

  const usable = status.people.filter((p) => p.photos > 0).length;
  if (usable > 0) {
    setSummary(() => t(`Пратим ${plural(usable, 'особу', 'особе', 'особа')}.`), 'ok');
  } else {
    setSummary(() => t('Још нема слика.'), 'warn');
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

/** The line above the list of names read from pictures; hidden when there is nothing to say. */
function setNameImagesStatus(text) {
  nameImagesStatus.hidden = !text;
  if (text) show(nameImagesStatus, () => t(text));
}

function renderNameImages(results) {
  nameImages.replaceChildren();
  setNameImagesStatus(results.length > 0 ? 'Имена прочитана са слика:' : '');
  for (const result of results) {
    const item = document.createElement('li');
    if (result.names.length > 0) {
      item.textContent = `${result.names.join(', ')} (${result.file})`;
    } else {
      show(item, () => `${result.file}: ${t(result.problem)}`);
      item.className = 'problem';
    }
    nameImages.append(item);
  }
}

/** Read the names in the text-images folder, unless nothing there has changed since last time. */
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
    setNameImagesStatus('Читам слике…');
    results = await askEngine({ type: 'read-name-images', files });
    if (!Array.isArray(results)) {
      setNameImagesStatus('Слике нису прочитане. Кликни Освежи.');
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
  setSummary(() => t('Читам слике…'));
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
  setSummary(() => t('Покретање траје предуго. Поново учитај екстензију.'), 'warn');
}

// The (i) next to a heading shows or hides its explanation.
for (const button of document.querySelectorAll('.info')) {
  button.addEventListener('click', () => {
    const explanation = $(button.getAttribute('aria-controls'));
    explanation.hidden = !explanation.hidden;
    button.setAttribute('aria-expanded', String(!explanation.hidden));
  });
}

rescan.addEventListener('click', async () => {
  rescan.disabled = true;
  await sync({ force: true });
  rescan.disabled = false;
});

sync();
