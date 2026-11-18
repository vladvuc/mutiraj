// Lists the photos in images/<name>/ inside the extension folder. Each folder
// there is one person, except images/text/, which holds pictures of text to
// mute on.
//
// Only a regular extension page (the popup) is allowed to read the extension's
// own directory; the background engine is not. So the popup builds this list,
// stores it, and hands it to the engine.

function readEntries(directory) {
  return new Promise((resolve, reject) => {
    const reader = directory.createReader();
    const all = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

const PHOTOS_FOLDER = 'images';
const TEXT_FOLDER = 'text'; // inside images/; not a person

/** Where the pictures of text are, from the extension folder. The engine loads them from here. */
export const TEXT_IMAGES_FOLDER = `${PHOTOS_FOLDER}/${TEXT_FOLDER}`;

function getDirectory(parent, name) {
  return new Promise((resolve) => parent.getDirectory(name, {}, resolve, () => resolve(null)));
}

function getMetadata(entry) {
  return new Promise((resolve) => entry.getMetadata(resolve, () => resolve(null)));
}

/** @returns {Promise<{name: string, files: {name: string, size: number, modified: number}[]}[]>} */
export async function listPhotoFolders() {
  const root = await new Promise((resolve) => chrome.runtime.getPackageDirectoryEntry(resolve));
  const images = await getDirectory(root, PHOTOS_FOLDER);
  if (!images) return [];

  const folders = [];
  for (const entry of await readEntries(images)) {
    if (!entry.isDirectory || entry.name === TEXT_FOLDER) continue;
    const files = [];
    for (const file of await readEntries(entry)) {
      if (!file.isFile || file.name.startsWith('.')) continue;
      const meta = await getMetadata(file);
      files.push({ name: file.name, size: meta?.size ?? 0, modified: meta?.modificationTime?.getTime() ?? 0 });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    folders.push({ name: entry.name, files });
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Lists the images in images/text/: pictures of text as it is written on screen,
 * an alternative to typing the text in the popup.
 * @returns {Promise<{name: string, size: number, modified: number}[]>}
 */
export async function listNameImages() {
  const root = await new Promise((resolve) => chrome.runtime.getPackageDirectoryEntry(resolve));
  const images = await getDirectory(root, PHOTOS_FOLDER);
  const folder = images && (await getDirectory(images, TEXT_FOLDER));
  if (!folder) return [];

  const files = [];
  for (const file of await readEntries(folder)) {
    if (!file.isFile || file.name.startsWith('.')) continue;
    const meta = await getMetadata(file);
    files.push({ name: file.name, size: meta?.size ?? 0, modified: meta?.modificationTime?.getTime() ?? 0 });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/** Changes whenever a photo is added, removed or replaced. */
export function photosSignature(folders) {
  return JSON.stringify(folders ?? []);
}
