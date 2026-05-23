const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const OPTIONS_HTML = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');

test('toast styling uses restrained slide and fade animation', () => {
  assert.match(OPTIONS_HTML, /@keyframes\s+toast-enter/);
  assert.match(OPTIONS_HTML, /\.toast:not\(\[hidden\]\):not\(\.toast-immediate\)\s*{[^}]*animation:\s*toast-enter 220ms cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/s);
  assert.match(OPTIONS_HTML, /\.toast\.toast-immediate\s*{[^}]*animation:\s*none/s);
  assert.match(OPTIONS_HTML, /transform:\s*translateY\(-18px\)/);
  assert.match(OPTIONS_HTML, /opacity:\s*0/);
  assert.match(OPTIONS_HTML, /opacity:\s*1/);
});

test('toast animation respects reduced motion preference', () => {
  assert.match(OPTIONS_HTML, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(OPTIONS_HTML, /\.toast:not\(\[hidden\]\)\s*{[^}]*animation:\s*none/s);
});
