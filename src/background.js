// The recognition engine needs a DOM (canvas + WebGL), which a service worker
// does not have, so it lives in an offscreen document. This worker makes sure
// that document exists and hands it the stored photo list (the offscreen
// document cannot read chrome.storage itself).

import { toLatin } from './lib/latin.js';

const ENGINE_PATH = 'src/engine.html';

let creating = null;

async function ensureEngine() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(ENGINE_PATH)],
  });
  if (existing.length > 0) return;

  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: ENGINE_PATH,
        reasons: ['WORKERS'],
        justification: 'Runs on-device face recognition on video frames.',
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'background') return undefined;

  if (message.type === 'ensure-engine') {
    ensureEngine().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error?.message ?? error) }),
    );
    return true;
  }
  if (message.type === 'get-photos') {
    chrome.storage.local.get('photos').then(
      ({ photos }) => sendResponse({ photos: photos ?? null }),
      () => sendResponse({ photos: null }),
    );
    return true;
  }
  return undefined;
});

// The toolbar tooltip follows the script chosen in the popup (Cyrillic or Latin).
async function applyLanguage() {
  const { lang } = await chrome.storage.local.get('lang');
  const name = chrome.runtime.getManifest().name;
  await chrome.action.setTitle({ title: lang === 'lat' ? toLatin(name) : name });
}

applyLanguage();
chrome.runtime.onStartup.addListener(applyLanguage);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'lang' in changes) applyLanguage();
});

// Only the popup can read the photos folder, so show it once after installing:
// that picks up the photos and confirms who is being watched for.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.action.openPopup().catch(() => {});
});
