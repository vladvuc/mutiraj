// Runs on YouTube. It mutes the video while a known person is on screen, and
// gives the sound back as soon as they are gone. It knows they are there in two
// ways:
//
//   - their face: several times per second it grabs the current video frame and
//     asks the engine who is in it;
//   - their name: about once per second it asks the engine to read the text in
//     the frame, and looks for the names typed in the popup.

import { createTracker } from './lib/tracker.js';
import { clampThreshold, DEFAULT_THRESHOLD } from './lib/match.js';
import { parseNames, findName } from './lib/names.js';
import { toLatin } from './lib/latin.js';

const SCAN_INTERVAL_MS = 200;
const MAX_FRAME_WIDTH = 960;
const ENGINE_RETRY_MS = 2000;

// Reading text is much slower than finding faces, so it runs less often and on
// a sharper frame (small caption text needs the pixels).
const TEXT_INTERVAL_MS = 1000;
const MAX_TEXT_FRAME_WIDTH = 1280;
const TEXT_MISSES_TO_DROP = 2; // reads in a row without the name before it counts as gone
const TEXT_STALE_MS = 8000; // forget a name if text reading has stopped answering

const settings = { enabled: true, threshold: DEFAULT_THRESHOLD, textEnabled: false, names: [], latin: false };
const nameSources = { typed: '', fromImages: [] }; // typed in the popup, and read from the images in names/
const tracker = createTracker();
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let busy = false;
let textBusy = false;
let lastEngineRequest = 0;
let watched = null; // the <video> we have listeners on
let mutedByUs = false; // true only while the sound is off because we turned it off
let nameSeen = null; // {label, at, misses}: a watched name currently written on screen
let notice = null; // {host, box, name}: the note shown on the video while it is muted

// --- settings ----------------------------------------------------------------

function watchingNames() {
  return settings.textEnabled && settings.names.length > 0;
}

function applySettings(values) {
  if ('enabled' in values) settings.enabled = values.enabled !== false;
  if ('threshold' in values) settings.threshold = clampThreshold(values.threshold);
  if ('textEnabled' in values) settings.textEnabled = values.textEnabled === true;
  if ('names' in values) nameSources.typed = values.names ?? '';
  if ('imageNames' in values) nameSources.fromImages = values.imageNames ?? [];
  if ('lang' in values) {
    settings.latin = values.lang === 'lat';
    if (notice) notice.box.textContent = noticeText(notice.name);
  }
  settings.names = parseNames(nameSources.typed, nameSources.fromImages);
  if (!watchingNames()) nameSeen = null;
}

chrome.storage.local.get(['enabled', 'threshold', 'textEnabled', 'names', 'imageNames', 'lang']).then(applySettings);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const values = {};
  for (const [key, change] of Object.entries(changes)) values[key] = change.newValue;
  applySettings(values);
  if (!settings.enabled) release();
});

// --- sound -------------------------------------------------------------------

/**
 * Turn the sound off or on. YouTube's own mute is used when the page has it;
 * otherwise the <video> element is muted directly.
 */
function setMuted(video, muted) {
  const event = new CustomEvent(muted ? 'mute-face:mute' : 'mute-face:unmute', { bubbles: true, cancelable: true });
  const handledByYouTube = !video.dispatchEvent(event);
  if (!handledByYouTube) video.muted = muted;
}

/** @param {import('./lib/tracker.js').Found} found */
function mute(video, found) {
  // Already silent by the viewer's own choice: nothing to do, and nothing to undo later.
  if (video.muted) return;
  mutedByUs = true;
  setMuted(video, true);
  showNotice(video, found.name);
}

function unmute() {
  hideNotice();
  if (!mutedByUs) return;
  mutedByUs = false;
  if (watched) setMuted(watched, false);
}

/** Give the sound back and start from scratch. */
function release() {
  unmute();
  tracker.reset();
  nameSeen = null;
}

function onVolumeChange() {
  // The sound came back on and we did not do it: leave it on until the person is gone.
  if (mutedByUs && watched && !watched.muted) {
    mutedByUs = false;
    tracker.overridden();
    hideNotice();
  }
}

// --- the video ---------------------------------------------------------------

function isPlaying(video) {
  return !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0;
}

/** The video the viewer is watching: the largest one that is playing. */
function currentVideo() {
  let best = null;
  let bestArea = 0;
  for (const video of document.querySelectorAll('video')) {
    if (!isPlaying(video)) continue;
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = video;
      bestArea = area;
    }
  }
  return best;
}

// A different video was loaded into the same player.
function onNewVideo() {
  release();
}

function watch(video) {
  if (watched === video) return;
  if (watched) {
    release();
    watched.removeEventListener('volumechange', onVolumeChange);
    watched.removeEventListener('emptied', onNewVideo);
  }
  watched = video;
  video.addEventListener('volumechange', onVolumeChange);
  video.addEventListener('emptied', onNewVideo);
}

function grabFrame(video, maxWidth) {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// While the tab is in the background the browser stops updating video frames,
// so we cannot tell who is on screen. Do not leave the sound stuck off.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) release();
});

// YouTube remembers its mute between visits; do not leave ours behind.
window.addEventListener('pagehide', () => release());

// --- the on-video notice -----------------------------------------------------

function noticeText(name) {
  return `${settings.latin ? toLatin('Мутирано') : 'Мутирано'}: ${name}`;
}

function showNotice(video, name) {
  hideNotice();
  const host = document.createElement('div');
  host.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.style.cssText =
    'font:500 16px/1.3 system-ui,-apple-system,sans-serif;color:#fff;background:rgba(15,15,15,.82);' +
    'padding:10px 18px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4);';
  box.textContent = noticeText(name);
  shadow.append(box);
  (video.closest('.html5-video-player') ?? video.parentElement ?? document.body).append(host);
  notice = { host, box, name };
}

function hideNotice() {
  notice?.host.remove();
  notice = null;
}

// --- talking to the engine ---------------------------------------------------

async function askEngine(message) {
  try {
    return await chrome.runtime.sendMessage({ target: 'engine', ...message });
  } catch {
    return undefined; // engine document is not running yet
  }
}

function startEngine() {
  const now = Date.now();
  if (now - lastEngineRequest < ENGINE_RETRY_MS) return;
  lastEngineRequest = now;
  chrome.runtime.sendMessage({ target: 'background', type: 'ensure-engine' }).catch(() => {});
}

function orphaned() {
  if (chrome.runtime?.id) return false;
  // The extension was reloaded or removed; this copy of the script is orphaned.
  clearInterval(faceTimer);
  clearInterval(textTimer);
  release();
  return true;
}

// --- reading names -----------------------------------------------------------

/** The watched name written on screen right now, if any. */
function currentName() {
  if (!nameSeen) return null;
  if (Date.now() - nameSeen.at > TEXT_STALE_MS) nameSeen = null;
  return nameSeen?.label ?? null;
}

async function readNames() {
  if (orphaned()) return;
  if (textBusy || !settings.enabled || !watchingNames() || document.hidden) return;

  const video = currentVideo();
  if (!video) return;

  textBusy = true;
  try {
    let frame;
    try {
      frame = grabFrame(video, MAX_TEXT_FRAME_WIDTH);
    } catch {
      return; // protected (DRM) video: frames cannot be read
    }

    const result = await askEngine({ type: 'read-text', image: frame });
    if (!result || result.error) return; // the face loop takes care of starting the engine
    if (!watchingNames() || video !== watched) return;

    const name = findName(result.text, settings.names);
    if (name) {
      nameSeen = { label: name.label, at: Date.now(), misses: 0 };
    } else if (nameSeen) {
      nameSeen.misses += 1;
      if (nameSeen.misses >= TEXT_MISSES_TO_DROP) nameSeen = null;
    }
  } finally {
    textBusy = false;
  }
}

// --- recognising faces, and deciding -----------------------------------------

async function scan() {
  if (orphaned()) return;
  if (busy || !settings.enabled || document.hidden) return;

  const video = currentVideo();
  if (!video) return;
  watch(video);

  busy = true;
  try {
    let frame;
    try {
      frame = grabFrame(video, MAX_FRAME_WIDTH);
    } catch {
      return; // protected (DRM) video: frames cannot be read
    }

    const result = await askEngine({ type: 'detect', image: frame });
    if (!result || result.error) {
      startEngine();
      return;
    }
    if (!result.ready) return;

    // The answer is about a frame from a moment ago; ignore it if things changed since.
    if (!settings.enabled || document.hidden || video !== watched || !video.isConnected) return;

    const { action, found } = tracker.scan(result.faces, settings.threshold, currentName());
    if (action === 'mute') mute(video, found);
    else if (action === 'unmute') unmute();
  } finally {
    busy = false;
  }
}

startEngine();
const faceTimer = setInterval(scan, SCAN_INTERVAL_MS);
const textTimer = setInterval(readNames, TEXT_INTERVAL_MS);
