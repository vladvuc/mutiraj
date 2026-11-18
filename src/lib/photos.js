// Lists the photos in images/<name>/ inside the extension folder.
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

function getDirectory(parent, name) {
  return new Promise((resolve) => parent.getDirectory(name, {}, resolve, () => resolve(null)));
}

function getMetadata(entry) {
  return new Promise((resolve) => entry.getMetadata(resolve, () => resolve(null)));
}

/** @returns {Promise<{name: string, files: {name: string, size: number, modified: number}[]}[]>} */
export async function listPhotoFolders() {
  const root = await new Promise((resolve) => chrome.runtime.getPackageDirectoryEntry(resolve));
  const images = await getDirectory(root, 'images');
  if (!images) return [];

  const folders = [];
  for (const entry of await readEntries(images)) {
    if (!entry.isDirectory) continue;
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
 * Lists the images in names/: pictures of a name as it is written on screen.
 * @returns {Promise<{name: string, size: number, modified: number}[]>}
 */
export async function listNameImages() {
  const root = await new Promise((resolve) => chrome.runtime.getPackageDirectoryEntry(resolve));
  const folder = await getDirectory(root, 'names');
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
