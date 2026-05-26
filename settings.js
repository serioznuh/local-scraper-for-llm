(function(root) {
  'use strict';

  const SETTINGS_VERSION = 2;
  const STORAGE_KEY = 'settings';
  const CLIPBOARD_MODES = Object.freeze(['off', 'markdown', 'file']);
  const DEFAULT_REDDIT_COMMENT_MIN_SCORE = 2;
  const DEFAULT_SETTINGS = Object.freeze({
    version: SETTINGS_VERSION,
    savePath: '',
    clipboardMode: 'off',
    openAfterSave: false,
    redditCommentScoreFilterEnabled: false,
    redditCommentMinScore: DEFAULT_REDDIT_COMMENT_MIN_SCORE
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeBoolean(value) {
    return value === true || value === 1;
  }

  function normalizePath(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeInteger(value, fallback) {
    if (typeof value === 'string' && !value.trim()) return fallback;
    if (typeof value !== 'number' && typeof value !== 'string') return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.trunc(number);
  }

  function normalizeClipboardMode(source) {
    if (CLIPBOARD_MODES.includes(source.clipboardMode)) {
      return source.clipboardMode;
    }
    if (source.copyToClipboard === true) {
      return 'markdown';
    }
    return 'off';
  }

  function normalizeSettings(rawSettings, legacySavePath) {
    const source = isPlainObject(rawSettings) ? rawSettings : {};
    const savePath = normalizePath(source.savePath) || normalizePath(legacySavePath);

    return {
      version: SETTINGS_VERSION,
      savePath,
      clipboardMode: normalizeClipboardMode(source),
      openAfterSave: normalizeBoolean(source.openAfterSave),
      redditCommentScoreFilterEnabled: normalizeBoolean(source.redditCommentScoreFilterEnabled),
      redditCommentMinScore: normalizeInteger(source.redditCommentMinScore, DEFAULT_REDDIT_COMMENT_MIN_SCORE)
    };
  }

  function mergeSettings(currentSettings, patch) {
    const current = normalizeSettings(currentSettings);
    const next = isPlainObject(patch) ? patch : {};
    return normalizeSettings(Object.assign({}, current, next));
  }

  function describeOutputActions(rawSettings) {
    const settings = normalizeSettings(rawSettings);
    if (!settings.savePath) return 'Set save directory';

    if (settings.clipboardMode === 'markdown' && settings.openAfterSave) {
      return 'Save, copy text, and open';
    }
    if (settings.clipboardMode === 'file' && settings.openAfterSave) {
      return 'Save, copy file, and open';
    }
    if (settings.clipboardMode === 'markdown') return 'Save and copy text';
    if (settings.clipboardMode === 'file') return 'Save and copy file';
    if (settings.openAfterSave) return 'Save and open';
    return 'Save only';
  }

  const api = {
    SETTINGS_VERSION,
    STORAGE_KEY,
    CLIPBOARD_MODES,
    DEFAULT_SETTINGS,
    DEFAULT_REDDIT_COMMENT_MIN_SCORE,
    normalizeSettings,
    mergeSettings,
    describeOutputActions
  };

  root.ScraperSettings = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
