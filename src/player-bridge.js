// Runs inside the page itself (not the extension's sandbox), because that is
// the only place YouTube's own player controls can be reached.
//
// The content script fires 'mute-face:mute' / 'mute-face:unmute' on the <video>
// element. We press YouTube's own mute for that player, so the speaker icon and
// YouTube's idea of the sound stay in step, and cancel the event to say "done".
// If this is not a YouTube player the event is left alone and the content
// script mutes the <video> element directly instead.
(() => {
  const handler = (muted) => (event) => {
    const player = event.target?.closest?.('.html5-video-player');
    const press = muted ? player?.mute : player?.unMute;
    if (typeof press !== 'function') return;
    try {
      press.call(player);
      event.preventDefault();
    } catch {
      // leave the event uncancelled so the content script falls back
    }
  };

  document.addEventListener('mute-face:mute', handler(true));
  document.addEventListener('mute-face:unmute', handler(false));
})();
