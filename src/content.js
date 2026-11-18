// Runs on YouTube. It mutes the video while a known person is on screen, and
// gives the sound back as soon as they are gone. It knows they are there in two
// ways:
//
//   - their face: several times per second it grabs the current video frame and
//     asks the engine who is in it;
//   - their name: about once per second it asks the engine to read the text in
//     the frame, and looks for the names typed in the popup.
//
// Everything it does, and why, is written to the tab's console as [mute-face].

import { createTracker, DEFAULT_MISSES_TO_UNMUTE } from './lib/tracker.js';
import { closestFace, clampThreshold, DEFAULT_THRESHOLD } from './lib/match.js';
import { parseNames, findName } from './lib/names.js';

const SCAN_INTERVAL_MS = 200;
const MAX_FRAME_WIDTH = 960;
const ENGINE_RETRY_MS = 2000;

// Reading text is much slower than finding faces, so it runs less often and on
// a sharper frame (small caption text needs the pixels).
const TEXT_INTERVAL_MS = 1000;
const MAX_TEXT_FRAME_WIDTH = 1280;
const TEXT_MISSES_TO_DROP = 2; // reads in a row without the name before it counts as gone
const TEXT_STALE_MS = 8000; // forget a name if text reading has stopped answering

const settings = { enabled: true, threshold: DEFAULT_THRESHOLD, verbose: false, textEnabled: false, names: [] };
const nameSources = { typed: '', fromImages: [] }; // typed in the popup, and read from the images in names/
const tracker = createTracker();
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let busy = false;
let textBusy = false;
let lastEngineRequest = 0;
let watched = null; // the <video> we have listeners on
let mutedByUs = false; // true only while the sound is off because we turned it off
let mutedFor = null; // name of the person we muted for
let nameSeen = null; // {label, at, misses}: a watched name currently written on screen
let notice = null;
let engineSeen = false;

// --- logging -----------------------------------------------------------------

function videoTime() {
  const seconds = watched?.currentTime ?? 0;
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`;
}

function log(message) {
  console.log(`%c[mute-face]%c ${videoTime()}  ${message}`, 'color:#d92d20;font-weight:bold', '');
}

// Why a face that is not a match on its own still counts as the person we muted for.
const KEPT = {
  recognised: '',
  name: '',
  'close enough': '. Kept muted: close enough for someone already recognised',
  'same spot': '. Kept muted: same spot on screen as the person recognised a moment ago',
};

/** What one check saw, in words. */
function describe(faces, threshold, name) {
  let seen;
  if (!faces?.length) {
    seen = 'no face found in the frame';
  } else {
    const closest = closestFace(faces);
    const verdict = closest.distance <= threshold ? 'a match' : 'not a match';
    const count = `${faces.length} face${faces.length === 1 ? '' : 's'} in the frame`;
    seen = `${count}, closest is ${closest.distance.toFixed(2)} from ${closest.name} (limit ${threshold.toFixed(2)}): ${verdict}`;
  }
  if (watchingNames()) seen += name ? `; the name "${name}" is written on screen` : '; no watched name written on screen';
  return seen;
}

/** Text read off a frame, squeezed onto one line for the log. */
function quote(text) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return 'nothing';
  return `"${line.length > 120 ? `${line.slice(0, 120)}…` : line}"`;
}

function nameList() {
  return settings.names.map((name) => `"${name.label}"`).join(', ');
}

// --- settings ----------------------------------------------------------------

function watchingNames() {
  return settings.textEnabled && settings.names.length > 0;
}

function applySettings(values) {
  if ('enabled' in values) settings.enabled = values.enabled !== false;
  if ('threshold' in values) settings.threshold = clampThreshold(values.threshold);
  if ('verbose' in values) settings.verbose = values.verbose === true;
  if ('textEnabled' in values) settings.textEnabled = values.textEnabled === true;
  if ('names' in values) nameSources.typed = values.names ?? '';
  if ('imageNames' in values) nameSources.fromImages = values.imageNames ?? [];
  settings.names = parseNames(nameSources.typed, nameSources.fromImages);
  if (!watchingNames()) nameSeen = null;
}

chrome.storage.local.get(['enabled', 'threshold', 'verbose', 'textEnabled', 'names', 'imageNames']).then(applySettings);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const values = {};
  for (const [key, change] of Object.entries(changes)) values[key] = change.newValue;
  applySettings(values);
  if ('threshold' in values) log(`match limit changed to ${settings.threshold.toFixed(2)}`);
  if ('textEnabled' in values || 'names' in values || 'imageNames' in values) {
    if (!settings.textEnabled) log('reading names on screen is off');
    else if (settings.names.length === 0) log('reading names on screen is on, but there are no names to watch for yet');
    else log(`reading names on screen is on, watching for ${nameList()}`);
  }
  if ('enabled' in values) {
    log(settings.enabled ? 'turned on' : 'turned off');
    if (!settings.enabled) release('Mute Face was turned off');
  }
});

// --- sound -------------------------------------------------------------------

/**
 * Turn the sound off or on. YouTube's own mute is used when the page has it;
 * otherwise the <video> element is muted directly.
 * @returns {'YouTube mute' | 'video element'} which one did the job
 */
function setMuted(video, muted) {
  const event = new CustomEvent(muted ? 'mute-face:mute' : 'mute-face:unmute', { bubbles: true, cancelable: true });
  const handledByYouTube = !video.dispatchEvent(event);
  if (handledByYouTube) return 'YouTube mute';
  video.muted = muted;
  return 'video element';
}

/** @param {import('./lib/tracker.js').Found} found */
function mute(video, found, threshold) {
  mutedFor = found.name;
  const why =
    found.why === 'name'
      ? `the name "${found.name}" is written on screen`
      : `${found.name} is on screen (distance ${found.face.distance.toFixed(2)}, limit ${threshold.toFixed(2)})`;
  if (video.muted) {
    // Already silent by the viewer's own choice: nothing to do, and nothing to undo later.
    log(`${why}, but the sound was already off, so nothing to do`);
    return;
  }
  mutedByUs = true;
  const how = setMuted(video, true);
  showNotice(video, found.name);
  log(`MUTED via ${how}: ${why}`);
}

function unmute(reason) {
  hideNotice();
  if (!mutedByUs) return;
  mutedByUs = false;
  const how = watched ? setMuted(watched, false) : 'video element';
  log(`UNMUTED via ${how}: ${reason}`);
}

/** Give the sound back and start from scratch. */
function release(reason) {
  unmute(reason);
  tracker.reset();
  mutedFor = null;
  nameSeen = null;
}

function onVolumeChange() {
  // The sound came back on and we did not do it.
  if (mutedByUs && watched && !watched.muted) {
    mutedByUs = false;
    tracker.overridden();
    hideNotice();
    log(
      `sound was turned back on by you or by YouTube, not by Mute Face. Leaving it on until ${mutedFor} leaves the screen`,
    );
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

function onNewVideo() {
  release('a different video was loaded');
}

function watch(video) {
  if (watched === video) return;
  if (watched) {
    release('switched to a different player');
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
  if (document.hidden) release('the tab went to the background, where frames cannot be checked');
});

// YouTube remembers its mute between visits; do not leave ours behind.
window.addEventListener('pagehide', () => release('the page was closed'));

// --- the on-video notice -----------------------------------------------------

function showNotice(video, name) {
  hideNotice();
  const host = document.createElement('div');
  host.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.style.cssText =
    'font:500 13px/1.3 system-ui,-apple-system,sans-serif;color:#fff;background:rgba(15,15,15,.82);' +
    'padding:8px 14px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4);';
  box.textContent = `Muted while ${name} is on screen`;
  shadow.append(box);
  (video.closest('.html5-video-player') ?? video.parentElement ?? document.body).append(host);
  notice = host;
}

function hideNotice() {
  notice?.remove();
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

function logEngineReady(result) {
  if (engineSeen) return;
  engineSeen = true;
  const faces =
    result.known > 0
      ? `Watching for ${result.known} ${result.known === 1 ? 'face' : 'faces'}, checking about 5 times a second`
      : 'No photos have been learned yet (click the Mute Face toolbar icon to read images/person/)';
  const names = watchingNames() ? `Reading on-screen text about once a second for ${nameList()}` : 'Reading names on screen is off';
  log(`ready. ${faces}. ${names}.`);
}

function orphaned() {
  if (chrome.runtime?.id) return false;
  // The extension was reloaded or removed; this copy of the script is orphaned.
  clearInterval(faceTimer);
  clearInterval(textTimer);
  release('the extension was reloaded');
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
    if (!result) return; // the face loop takes care of starting the engine
    if (result.error) {
      log(`could not read text: ${result.error}`);
      return;
    }
    if (!watchingNames() || video !== watched) return;

    const name = findName(result.text, settings.names);
    if (name) {
      if (nameSeen?.label !== name.label) log(`read the name "${name.label}" on screen (as "${name.read}")`);
      else if (settings.verbose) log(`text check: read ${quote(result.text)}. "${name.label}" is still there`);
      nameSeen = { label: name.label, at: Date.now(), misses: 0 };
    } else if (nameSeen) {
      nameSeen.misses += 1;
      if (nameSeen.misses >= TEXT_MISSES_TO_DROP) {
        log(`the name "${nameSeen.label}" is no longer written on screen. Read ${quote(result.text)}`);
        nameSeen = null;
      } else {
        log(`text check did not find "${nameSeen.label}", one more in a row and it counts as gone. Read ${quote(result.text)}`);
      }
    } else if (settings.verbose) {
      log(`text check: read ${quote(result.text)}. No watched name`);
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
    logEngineReady(result);

    // The answer is about a frame from a moment ago; ignore it if things changed since.
    if (!settings.enabled || document.hidden || video !== watched || !video.isConnected) return;

    const threshold = settings.threshold;
    const name = currentName();
    const seen = describe(result.faces, threshold, name);
    const before = tracker.state;
    const { action, found } = tracker.scan(result.faces, threshold, name);

    if (action === 'mute') {
      mute(video, found, threshold);
    } else if (action === 'unmute') {
      unmute(`${mutedFor} was not found in ${DEFAULT_MISSES_TO_UNMUTE} checks in a row. Last check: ${seen}`);
    } else if (before !== 'idle' && tracker.state === 'idle') {
      log(`${mutedFor} is gone; watching again. Last check: ${seen}`);
    } else if (before !== 'idle' && !found) {
      log(`check did not find ${mutedFor}, one more in a row and the sound comes back: ${seen}`);
    } else if (settings.verbose) {
      log(`check: ${seen}${found ? KEPT[found.why] : ''}`);
    }
  } finally {
    busy = false;
  }
}

startEngine();
const faceTimer = setInterval(scan, SCAN_INTERVAL_MS);
const textTimer = setInterval(readNames, TEXT_INTERVAL_MS);
