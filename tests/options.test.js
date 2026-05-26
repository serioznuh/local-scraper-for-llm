const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ScraperSettings = require('../settings.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createElement({ value = '', checked = false, hidden = false, textContent = '' } = {}) {
  return {
    value,
    checked,
    hidden,
    disabled: false,
    textContent,
    className: '',
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    focus() {}
  };
}

async function loadOptions({
  settings = {
    savePath: '/Users/me/Scrapes',
    clipboardMode: 'file',
    openAfterSave: true,
    redditCommentScoreFilterEnabled: false,
    redditCommentMinScore: 2
  },
  lastStatus = null,
  chooseDirectoryResponse = { success: true, directory: '/Users/me/Chosen' }
} = {}) {
  const clipboardModeInputs = [
    createElement({ value: 'off' }),
    createElement({ value: 'markdown' }),
    createElement({ value: 'file' })
  ];
  const elements = {
    settingsForm: createElement(),
    savePath: createElement(),
    chooseDirectoryBtn: createElement(),
    openAfterSave: createElement(),
    redditCommentScoreFilterEnabled: createElement(),
    redditCommentMinScore: createElement(),
    saveSettingsBtn: createElement({ textContent: 'Save Settings' }),
    toast: createElement({ hidden: true }),
    unsavedChangesToast: createElement({ hidden: true }),
    banner: createElement({ hidden: true }),
    status: createElement()
  };
  const messages = [];
  const timers = [];
  const storageListeners = [];
  const document = {
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    getElementById(id) {
      return elements[id];
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="clipboardMode"]') return clipboardModeInputs;
      return [];
    }
  };
  const context = {
    document,
    ScraperSettings,
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          messages.push(message);
          if (message.action === 'getSettings') {
            return { settings, lastStatus };
          }
          if (message.action === 'chooseDirectory') {
            return chooseDirectoryResponse;
          }
          if (message.action === 'saveSettings') {
            return { success: true, settings: message.settings };
          }
          throw new Error(`Unexpected message: ${message.action}`);
        }
      },
      storage: {
        onChanged: {
          addListener(handler) {
            storageListeners.push(handler);
          }
        }
      }
    },
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {}
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'options.js' });
  await document.listeners.DOMContentLoaded();

  return { elements, clipboardModeInputs, messages, storageListeners, timers };
}

test('options page loads without idle Ready text', async () => {
  const { elements } = await loadOptions();

  assert.equal(elements.status.textContent, '');
  assert.equal(elements.banner.hidden, true);
  assert.equal(elements.toast.hidden, true);
  assert.equal(elements.unsavedChangesToast.hidden, true);
});

test('options page does not replay a stored scrape success', async () => {
  const { elements } = await loadOptions({
    lastStatus: {
      state: 'success',
      message: 'Saved: /Users/me/Scrapes/page.md',
      showInSettings: false
    }
  });

  assert.equal(elements.banner.hidden, true);
  assert.equal(elements.banner.textContent, '');
});

test('options page keeps setting-fix errors visible', async () => {
  const { elements, timers } = await loadOptions({
    lastStatus: {
      state: 'error',
      message: 'Choose a save directory before scraping',
      showInSettings: true
    }
  });

  assert.equal(elements.banner.hidden, false);
  assert.equal(elements.banner.textContent, 'Choose a save directory before scraping');
  assert.equal(elements.banner.className, 'banner error');
  assert.equal(timers.length, 0);
});

test('options page trims trailing periods from stored status banners', async () => {
  const { elements } = await loadOptions({
    lastStatus: {
      state: 'error',
      message: 'Choose a save directory before scraping.',
      showInSettings: true
    }
  });

  assert.equal(elements.banner.hidden, false);
  assert.equal(elements.banner.textContent, 'Choose a save directory before scraping');
});

test('options page shows setting-fix errors that arrive while already open', async () => {
  const { elements, storageListeners } = await loadOptions();

  storageListeners[0]({
    lastStatus: {
      newValue: {
        state: 'error',
        message: 'Could not save the file. Permission denied: /Users/me/Scrapes',
        showInSettings: true
      }
    }
  }, 'local');

  assert.equal(elements.banner.hidden, false);
  assert.equal(elements.banner.textContent, 'Could not save the file. Permission denied: /Users/me/Scrapes');
  assert.equal(elements.banner.className, 'banner error');
});

test('options page does not show stored non-settings errors', async () => {
  const { elements } = await loadOptions({
    lastStatus: {
      state: 'error',
      message: 'Could not extract content. Try a regular web page with readable text',
      showInSettings: false
    }
  });

  assert.equal(elements.banner.hidden, true);
  assert.equal(elements.banner.textContent, '');
});

test('folder button fills the save directory field from the native picker', async () => {
  const { elements, messages } = await loadOptions();

  await elements.chooseDirectoryBtn.listeners.click();

  assert.equal(elements.savePath.value, '/Users/me/Chosen');
  assert.deepEqual(plain(messages.at(-1)), { action: 'chooseDirectory' });
});

test('editing save directory shows unsaved changes toast until reverted', async () => {
  const { elements } = await loadOptions();

  assert.equal(elements.unsavedChangesToast.hidden, true);

  elements.savePath.value = '/Users/me/Changed';
  elements.savePath.listeners.input();

  assert.equal(elements.banner.hidden, true);
  assert.equal(elements.unsavedChangesToast.hidden, false);
  assert.equal(elements.unsavedChangesToast.textContent, 'Unsaved changes');
  assert.equal(elements.unsavedChangesToast.className, 'toast banner warning');

  elements.savePath.value = '/Users/me/Scrapes';
  elements.savePath.listeners.input();

  assert.equal(elements.unsavedChangesToast.hidden, true);
});

test('changing output actions shows unsaved changes toast', async () => {
  const { elements, clipboardModeInputs } = await loadOptions();

  clipboardModeInputs[0].checked = true;
  clipboardModeInputs[2].checked = false;
  clipboardModeInputs[0].listeners.change();

  assert.equal(elements.unsavedChangesToast.hidden, false);

  elements.openAfterSave.checked = false;
  elements.openAfterSave.listeners.change();

  assert.equal(elements.unsavedChangesToast.hidden, false);
});

test('options page renders Reddit score filter settings', async () => {
  const { elements } = await loadOptions({
    settings: {
      savePath: '/Users/me/Scrapes',
      clipboardMode: 'off',
      openAfterSave: false,
      redditCommentScoreFilterEnabled: true,
      redditCommentMinScore: 4
    }
  });

  assert.equal(elements.redditCommentScoreFilterEnabled.checked, true);
  assert.equal(elements.redditCommentMinScore.value, '4');
  assert.equal(elements.redditCommentMinScore.disabled, false);
});

test('Reddit score minimum input is disabled until filtering is enabled', async () => {
  const { elements } = await loadOptions();

  assert.equal(elements.redditCommentScoreFilterEnabled.checked, false);
  assert.equal(elements.redditCommentMinScore.disabled, true);

  elements.redditCommentScoreFilterEnabled.checked = true;
  elements.redditCommentScoreFilterEnabled.listeners.change();

  assert.equal(elements.redditCommentMinScore.disabled, false);
  assert.equal(elements.unsavedChangesToast.hidden, false);
});

test('saving settings includes Reddit score filter settings', async () => {
  const { elements, messages } = await loadOptions();

  elements.redditCommentScoreFilterEnabled.checked = true;
  elements.redditCommentScoreFilterEnabled.listeners.change();
  elements.redditCommentMinScore.value = '3';
  elements.redditCommentMinScore.listeners.input();

  await elements.settingsForm.listeners.submit({ preventDefault() {} });

  assert.deepEqual(plain(messages.at(-1)), {
    action: 'saveSettings',
    settings: {
      version: 2,
      savePath: '/Users/me/Scrapes',
      clipboardMode: 'file',
      openAfterSave: true,
      redditCommentScoreFilterEnabled: true,
      redditCommentMinScore: 3
    }
  });
});

test('folder picker marks selected directory as unsaved', async () => {
  const { elements } = await loadOptions();

  await elements.chooseDirectoryBtn.listeners.click();

  assert.equal(elements.savePath.value, '/Users/me/Chosen');
  assert.equal(elements.unsavedChangesToast.hidden, false);
});

test('folder button cancel leaves no error banner', async () => {
  const { elements } = await loadOptions({
    chooseDirectoryResponse: {
      success: false,
      cancelled: true,
      error: 'User canceled'
    }
  });

  await elements.chooseDirectoryBtn.listeners.click();

  assert.equal(elements.banner.hidden, true);
  assert.equal(elements.banner.textContent, '');
});

test('saving settings shows a temporary top success toast', async () => {
  const { elements, timers } = await loadOptions();

  elements.savePath.value = '/Users/me/Changed';
  elements.savePath.listeners.input();
  assert.equal(elements.unsavedChangesToast.hidden, false);

  await elements.settingsForm.listeners.submit({ preventDefault() {} });

  assert.equal(elements.saveSettingsBtn.textContent, 'Save Settings');
  assert.equal(elements.unsavedChangesToast.hidden, true);
  assert.equal(elements.banner.hidden, true);
  assert.equal(elements.toast.hidden, false);
  assert.equal(elements.toast.textContent, 'Settings saved');
  assert.equal(elements.toast.className, 'toast banner success toast-immediate');

  timers.at(-1)();

  assert.equal(elements.toast.hidden, true);
});

test('saving unchanged settings keeps the normal success toast animation', async () => {
  const { elements } = await loadOptions();

  assert.equal(elements.unsavedChangesToast.hidden, true);

  await elements.settingsForm.listeners.submit({ preventDefault() {} });

  assert.equal(elements.unsavedChangesToast.hidden, true);
  assert.equal(elements.toast.hidden, false);
  assert.equal(elements.toast.textContent, 'Settings saved');
  assert.equal(elements.toast.className, 'toast banner success');
});
