'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'src/page.html'), 'utf8');
for (const [token, file] of [['/* INLINE_STYLES */', 'styles.css'], ['/* INLINE_CORE */', 'core.js'], ['/* INLINE_APP */', 'app.js']]) {
  const content = fs.readFileSync(path.join(dir, 'src', file), 'utf8');
  if (/<\/script/i.test(content)) throw new Error('Unexpected script closing tag in ' + file);
  if (!html.includes(token)) throw new Error('Missing template token: ' + token);
  html = html.replace(token, () => content);
}
fs.writeFileSync(path.join(dir, 'index.html'), html);
console.log('Built index.html (' + Buffer.byteLength(html) + ' bytes)');
