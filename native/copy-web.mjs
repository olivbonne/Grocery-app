// Copies the web app into native/www, the folder Capacitor ships inside the iPhone and Android apps (docs/native-app.md).
// The app's files are the same ones Vercel serves; the AI functions (api/) stay on the server and are called by full address
// (js/app.js API_ORIGIN, v2.49).
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..'), out = join(here, 'www');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'privacy.html', 'app.css', 'manifest.webmanifest', 'outfit-latin.woff2', 'outfit-latin-ext.woff2', 'js', 'vendor', 'img']) {
  const src = join(root, f); if (existsSync(src)) cpSync(src, join(out, f), { recursive: true }); }
console.log('Copied the web app into native/www');
