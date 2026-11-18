// Content scripts cannot be ES modules directly, so this stub loads the real one.
import(chrome.runtime.getURL('src/content.js')).catch((error) => {
  console.error('[mute-face] failed to start', error);
});
