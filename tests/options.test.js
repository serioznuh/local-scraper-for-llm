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
  settings = { savePath: '/Users/me/Scrapes', clipboardMode: 'file', openAfterSave: true },
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
    saveSettingsBtn: createElement({ textContent: 'Save Settings' }),
    banner: createElement({ hidden: true }),
    status: createElement()
  };
  const messages = [];
  const timers = [];
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
            return { settings, lastStatus: null };
          }
          if (message.action === 'chooseDirectory') {
            return chooseDirectoryResponse;
          }
          if (message.action === 'saveSettings') {
            return { success: true, settings: message.settings };
          }
          throw new Error(`Unexpected message: ${message.action}`);
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

  return { elements, clipboardModeInputs, messages, timers };
}

test('options page loads without idle Ready text', async () => {
  const { elements } = await loadOptions();

  assert.equal(elements.status.textContent, '');
  assert.equal(elements.banner.hidden, true);
});

test('folder button fills the save directory field from the native picker', async () => {
  const { elements, messages } = await loadOptions();

  await elements.chooseDirectoryBtn.listeners.click();

  assert.equal(elements.savePath.value, '/Users/me/Chosen');
  assert.deepEqual(plain(messages.at(-1)), { action: 'chooseDirectory' });
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

test('saving settings shows a temporary top success banner', async () => {
  const { elements, timers } = await loadOptions();

  await elements.settingsForm.listeners.submit({ preventDefault() {} });

  assert.equal(elements.saveSettingsBtn.textContent, 'Save Settings');
  assert.equal(elements.banner.hidden, false);
  assert.equal(elements.banner.textContent, 'Settings saved');
  assert.equal(elements.banner.className, 'banner success');

  timers.at(-1)();

  assert.equal(elements.banner.hidden, true);
});
