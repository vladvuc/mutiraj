# Mute Face

A browser extension for Brave, Vivaldi and other Chromium browsers. It watches the YouTube video you are playing and
mutes it while a person is on screen. The sound comes back as soon as they are gone. It knows the person is there in
two ways, which work together:

- **Their face**, recognised from photos you provide.
- **Their name**, read from text in the video, such as a caption under the speaker.

Everything runs on your machine. No frames or photos leave the browser.

## Setup

1. Put a few clear photos of the person in `images/person/` (JPG, PNG or WebP; iPhone HEIC photos need converting
   first, for example `sips -s format jpeg IMG_0001.HEIC --out IMG_0001.jpg`).
2. Open `brave://extensions` (or `vivaldi://extensions`), turn on **Developer mode**, click **Load unpacked** and pick
   this folder.
3. Click the Mute Face icon in the toolbar. It should say **Watching for 1 person**.

After adding, removing or replacing photos, click the icon again. It re-reads the folder each time it opens.

Faces alone are enough. To also mute on a written name, see [Names on screen](#names-on-screen).

## Using it

Play any YouTube video. While the person is on screen the video keeps playing with the sound off, and a small note
shows at the top of the player. When they leave the frame the sound comes back by itself, about half a second later.

- It uses YouTube's own mute, the same as clicking the speaker button, so the speaker icon shows the sound is off.
  Only that tab is muted, not your computer.
- If you had already muted the video yourself, it stays muted.
- If you turn the sound back on while the person is on screen, it stays on until they leave. It mutes again the next
  time they appear.
- YouTube remembers its mute between visits. Mute Face unmutes when you leave the page, but if the browser is killed
  while a mute is active, the next video may start muted.

The popup has these controls:

- **The switch** at the top turns all muting on and off.
- **Matching** sets how close a face must be to your photos. If it mutes for other people, move toward Stricter. If it
  misses the person, move toward Looser, or add more photos.
- **Names on screen** turns reading names on and off, and holds the names to watch for.
- **Log every check** adds a line to the log for each check, not only for mutes and unmutes.

## Names on screen

Turn on the **Names on screen** switch in the popup and give it names in either or both of these ways:

- **Type them**, one per line, in Latin or Cyrillic letters: `John Smith`, `Александар Нешто`.
- **Put a picture of the name** in the `names/` folder, for example a cropped screenshot of the caption, then click
  the toolbar icon. The popup shows what it read from each picture, so you can check it. Each line of text in a
  picture counts as one name, so crop to just the name.

About once a second the text in the video frame is read and searched for those names. While a name is on screen the
video is muted, exactly as for a face; either one is enough.

- Capitals, accents and punctuation do not matter.
- Either script matches the other: `Александар Нешто` also matches `Aleksandar Nešto` on screen, and the other way
  round.
- One or two misread letters in a longer name are tolerated. Names shorter than six letters must be read exactly.
- A name of fewer than three letters is ignored.

Reading text is slower than recognising faces: the mute lands about a second after the name appears, and the sound
returns about two and a half seconds after it disappears.

It reads English and other Latin-alphabet text, and Serbian Cyrillic. Other languages need their language file added
to `READ_LANGUAGES` in `src/engine.js` and to `scripts/vendor.mjs`.

## Seeing why it muted or unmuted

Open the YouTube tab's console with `Cmd+Option+J` and type `mute-face` in the filter box. Each line starts with the
video time:

```
[mute-face] 0:31.3  MUTED via YouTube mute: person is on screen (distance 0.34, limit 0.50)
[mute-face] 0:32.1  check did not find person, one more in a row and the sound comes back: 1 face in the frame, closest is 0.63 from person (limit 0.50): not a match
[mute-face] 0:33.1  UNMUTED via YouTube mute: person was not found in 2 checks in a row. Last check: 1 face in the frame, closest is 0.59 from person (limit 0.50): not a match
[mute-face] 1:14.0  read the name "John Smith" on screen (as "john smith")
[mute-face] 1:14.1  MUTED via YouTube mute: the name "John Smith" is written on screen
```

**Distance** is how different a face is from your photos: 0 is identical, and other people usually score above 0.6.
**Limit** is the Matching slider. A face at or under the limit starts a mute.

A face's distance wobbles from frame to frame as the person moves, turns or changes expression. So once someone has
been recognised, it takes less to keep the mute: a face up to 0.08 over the limit still counts, and so does a face in
the same spot on screen up to 0.20 over the limit.

If the log shows the sound coming back while the person is still on screen, look at the distance on those lines:

- Just over the limit, for example 0.55: move the slider toward Looser.
- Well over it, for example 0.65: add photos that look like those moments (that angle, those glasses, that lighting).
- `no face found in the frame`: the face was too small, turned away or covered to be detected at all.
- `sound was turned back on by you or by YouTube`: something other than Mute Face unmuted the video.

If a name on screen is not picked up, turn on **Log every check**. Each text check then shows exactly what was read
from the frame, so you can see whether the name was misread or not seen at all. Small, stylised or low-contrast text
is the usual reason.

## Tips for photos

- 3 to 10 photos work better than one. Mix angles, lighting, with and without glasses.
- One person per photo. If a photo shows several people, the largest face is used.
- The popup lists any photo it could not use and why.

## More than one person

Each folder inside `images/` is one person, and the folder name is shown in the note on the player:

```
images/
  person/
  another-name/
```

## Limits

- Small or turned-away faces, heavy disguises, and very fast cuts can be missed.
- The frame is checked about five times per second, so the mute lands a fraction of a second after the person appears
  and a few words can slip through.
- The sound returns after two checks in a row without the person. One check would be faster, but a single missed
  frame (a blink, a head turn) would then let blips of sound through. Change `DEFAULT_MISSES_TO_UNMUTE` in
  `src/lib/tracker.js` to tune this.
- When the person looks very unlike your photos for a moment (profile, sunglasses, eyes closed, far away), the sound
  can come back while they are still on screen, and mute again when they are recognised.
- It only works while the YouTube tab is visible. In a background tab the browser stops updating video frames, so the
  sound is left on.
- Text is read from the video picture only, not from the page around it (title, description, comments) and not from
  the audio.
- Paid or DRM-protected videos cannot be read and are ignored.

## Development

```
pnpm install
pnpm test       # unit tests for the matching and mute logic
pnpm vendor     # re-copy the libraries, models and language files into vendor/
```

After changing code, press the reload button on the extension's card in `brave://extensions` and refresh the YouTube
tab.

| Path                 | What it does                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| `src/content.js`     | Runs on YouTube: grabs frames, mutes and unmutes, shows the note, logs    |
| `src/player-bridge.js` | Runs inside the page to press YouTube's own mute                        |
| `src/engine.js`      | Hidden page that learns the photos, recognises faces and reads text       |
| `src/background.js`  | Starts the engine and hands it the stored photo list                      |
| `src/popup.*`        | Toolbar popup: reads the photos and names folders, status and settings    |
| `src/lib/tracker.js` | When to mute and when to unmute                                           |
| `src/lib/match.js`   | Face distance and threshold logic                                         |
| `src/lib/names.js`   | Finding watched names in text read from a frame, in Latin or Cyrillic     |
| `vendor/face-api/`   | [@vladmandic/face-api](https://github.com/vladmandic/face-api) and models |
| `vendor/tesseract/`  | [tesseract.js](https://github.com/naptha/tesseract.js) and language files |
