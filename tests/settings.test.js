const assert = require('node:assert/strict');
const test = require('node:test');

const settings = require('../settings.js');

test('normalizes missing settings to conservative defaults', () => {
  assert.deepEqual(settings.normalizeSettings(), {
    version: 2,
    savePath: '',
    clipboardMode: 'off',
    openAfterSave: false,
    redditCommentScoreFilterEnabled: false,
    redditCommentMinScore: 2
  });
});

test('migrates legacy savePath while keeping optional actions off', () => {
  assert.deepEqual(settings.normalizeSettings(null, '/Users/me/Scrapes'), {
    version: 2,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'off',
    openAfterSave: false,
    redditCommentScoreFilterEnabled: false,
    redditCommentMinScore: 2
  });
});

test('migrates legacy copy boolean to markdown clipboard mode', () => {
  assert.deepEqual(settings.normalizeSettings({
    savePath: '/Users/me/Scrapes',
    copyToClipboard: true
  }), {
    version: 2,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'markdown',
    openAfterSave: false,
    redditCommentScoreFilterEnabled: false,
    redditCommentMinScore: 2
  });
});

test('normalizes clipboard mode, booleans, savePath, and Reddit score filter', () => {
  assert.deepEqual(settings.normalizeSettings({
    version: 99,
    savePath: '  /Users/me/Scrapes  ',
    clipboardMode: 'file',
    openAfterSave: 1,
    redditCommentScoreFilterEnabled: 1,
    redditCommentMinScore: ' 4 '
  }), {
    version: 2,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'file',
    openAfterSave: true,
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 4
  });
});

test('invalid Reddit score minimum falls back to conservative default', () => {
  assert.equal(settings.normalizeSettings({
    savePath: '/Users/me/Scrapes',
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 'not-a-number'
  }).redditCommentMinScore, 2);
  assert.equal(settings.normalizeSettings({
    savePath: '/Users/me/Scrapes',
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: null
  }).redditCommentMinScore, 2);
  assert.equal(settings.normalizeSettings({
    savePath: '/Users/me/Scrapes',
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: true
  }).redditCommentMinScore, 2);
});

test('mergeSettings preserves Reddit score filter settings', () => {
  assert.deepEqual(settings.mergeSettings({
    savePath: '/Users/me/Scrapes',
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 5
  }, {
    clipboardMode: 'markdown'
  }), {
    version: 2,
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'markdown',
    openAfterSave: false,
    redditCommentScoreFilterEnabled: true,
    redditCommentMinScore: 5
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
