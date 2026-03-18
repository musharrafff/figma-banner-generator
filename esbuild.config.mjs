import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

// Build plugin sandbox code
await esbuild.build({
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2020',
  format: 'iife',
});

// Build UI script
const uiResult = await esbuild.build({
  entryPoints: ['src/ui.ts'],
  bundle: true,
  write: false,
  target: 'es2020',
  format: 'iife',
});

// Read HTML template and CSS
const html = readFileSync('src/ui.html', 'utf8');
const css = readFileSync('src/styles.css', 'utf8');
const js = uiResult.outputFiles[0].text;

// Inline JS and CSS into HTML
const finalHtml = html
  .replace('/* __INLINE_CSS__ */', css)
  .replace('/* __INLINE_JS__ */', js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/ui.html', finalHtml);

console.log('Build complete.');
