// Copies the libraries the extension needs at run time into vendor/, so it
// loads without node_modules or a bundler:
//   - face-api (face recognition) and the three models we use
//   - tesseract.js (text recognition), its engine and language data:
//     English (Latin letters) and Serbian (Cyrillic letters)
import { cp, mkdir, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = path.join(root, 'node_modules');
const vendor = path.join(root, 'vendor');

async function copy(from, to, files) {
  await mkdir(to, { recursive: true });
  for (const file of files) await cp(path.join(from, file), path.join(to, path.basename(file)));
}

await rm(vendor, { recursive: true, force: true });

// face-api
const faceApi = path.join(modules, '@vladmandic/face-api');
await copy(faceApi, path.join(vendor, 'face-api'), ['dist/face-api.esm.js', 'LICENSE']);
await copy(
  path.join(faceApi, 'model'),
  path.join(vendor, 'face-api/model'),
  ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model'].flatMap((name) => [
    `${name}-weights_manifest.json`,
    `${name}.bin`,
  ]),
);

// tesseract.js: the page-side library, its worker, the engine builds it picks
// between (we only use the LSTM reader), and language data. The languages
// here must match READ_LANGUAGES in src/engine.js.
// The engine is a dependency of tesseract.js, so find it from there (pnpm keeps it next to the real folder).
const tesseract = await realpath(path.join(modules, 'tesseract.js'));
const core = path.dirname(createRequire(path.join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'));
await copy(tesseract, path.join(vendor, 'tesseract'), ['dist/tesseract.esm.min.js', 'dist/worker.min.js', 'LICENSE.md']);
await copy(core, path.join(vendor, 'tesseract/core'), [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]);
for (const language of ['eng', 'srp']) {
  await copy(path.join(modules, `@tesseract.js-data/${language}/4.0.0_best_int`), path.join(vendor, 'tesseract/lang'), [
    `${language}.traineddata.gz`,
  ]);
}

console.log(`Vendored face-api and tesseract.js into ${path.relative(root, vendor)}`);
