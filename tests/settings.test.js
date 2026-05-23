const assert = require('node:assert/strict');
const test = require('node:test');

const settings = require('../settings.js');

test('normalizes missing settings to conservative defaults', () => {
  assert.deepEqual(settings.normalizeSettings(), {
    version: 1,
    savePath: '',
    clipboardMode: 'off',
    openAfterSave: false
  });
});

test('migrates legacy savePath while keeping optional actions off', () => {
  assert.deepEqual(settings.normalizeSettings(null, '/Users/me/Scrapes'), {
    version: 1,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'off',
    openAfterSave: false
  });
});

test('migrates legacy copy boolean to markdown clipboard mode', () => {
  assert.deepEqual(settings.normalizeSettings({
    savePath: '/Users/me/Scrapes',
    copyToClipboard: true
  }), {
    version: 1,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'markdown',
    openAfterSave: false
  });
});

test('normalizes clipboard mode, booleans, and savePath', () => {
  assert.deepEqual(settings.normalizeSettings({
    version: 99,
    savePath: '  /Users/me/Scrapes  ',
    clipboardMode: 'file',
    openAfterSave: 1
  }), {
    version: 1,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'file',
    openAfterSave: true
  });
});

test('summarizes output actions for toolbar and settings status text', () => {
  assert.equal(settings.describeOutputActions({
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'off',
    openAfterSave: false
  }), 'Save only');

  assert.equal(settings.describeOutputActions({
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'markdown',
    openAfterSave: true
  }), 'Save, copy text, and open');

  assert.equal(settings.describeOutputActions({
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'file',
    openAfterSave: true
  }), 'Save, copy file, and open');
});
