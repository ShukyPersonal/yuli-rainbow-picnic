import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'asset-manifest.json'), 'utf8'));
const sources = {};
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.file === 'string') {
    const path = resolve(root, value.file);
    if (relative(root, path).startsWith('..')) throw new Error('Asset path must stay inside the game folder.');
    const mime = path.endsWith('.mp3') ? 'audio/mpeg' : path.endsWith('.m4a') ? 'audio/mp4' : 'image/png';
    sources[value.file] ||= `data:${mime};base64,${readFileSync(path).toString('base64')}`;
  }
  Object.values(value).forEach(collect);
}
collect(manifest);
const script = `// Rebuilt from asset-manifest.json; all media is available offline.\n(() => {\nconst sources = ${JSON.stringify(sources)};\nconst assets = ${JSON.stringify(manifest)};\nfunction embed(value) {\n  if (!value || typeof value !== 'object') return;\n  if (value.file) { value.src = sources[value.file]; delete value.file; }\n  Object.values(value).forEach(embed);\n}\nembed(assets);\nwindow.YULI_ASSETS = assets;\n})();\n`;
writeFileSync(resolve(root, 'assets.js'), script);
console.log('Rebuilt offline artwork and music in assets.js.');
