const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ScraperSettings = require('../settings.js');

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function tooltipTitle(message) {
  return `${message}\n `;
}

function waitForMessage(listener, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message handler did not respond')), 50);
    listener(message, {}, response => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function createChromeMock({
  storedSettings = {},
  scriptResult = null,
  nativeResponse = { success: true, path: '/Users/me/Scrapes/page.md' },
  nativeLastError = null
} = {}) {
  const storage = {
    settings: ScraperSettings.normalizeSettings(storedSettings)
  };
  const calls = {
    badges: [],
    badgeColors: [],
    titles: [],
    openedOptions: 0,
    nativeMessages: [],
    scripts: [],
    storageSets: [],
    storageRemoves: []
  };
  const runtimeListeners = [];
  const actionListeners = [];

  const chrome = {
    action: {
      onClicked: {
        addListener(listener) {
          actionListeners.push(listener);
        }
      },
      setBadgeText(details) {
        calls.badges.push(details);
      },
      setBadgeBackgroundColor(details) {
        calls.badgeColors.push(details);
      },
      setTitle(details) {
        calls.titles.push(details);
      }
    },
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          runtimeListeners.push(listener);
        }
      },
      openOptionsPage() {
        calls.openedOptions += 1;
      },
      sendNativeMessage(host, message, callback) {
        calls.nativeMessages.push({ host, message });
        chrome.runtime.lastError = nativeLastError;
        callback(nativeResponse);
        chrome.runtime.lastError = null;
      }
    },
    scripting: {
      executeScript(details, callback) {
        calls.scripts.push(details);
        callback([{ result: scriptResult }]);
      }
    },
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(storage, key)) {
              result[key] = storage[key];
            }
          }
          callback(result);
        },
        set(values, callback = () => {}) {
          Object.assign(storage, values);
          calls.storageSets.push(values);
          callback();
        },
        remove(key, callback = () => {}) {
          delete storage[key];
          calls.storageRemoves.push(key);
          callback();
        }
      }
    }
  };

  return { chrome, calls, runtimeListeners, actionListeners, storage };
}

function loadBackground(mock) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const context = {
    chrome: mock.chrome,
    ScraperSettings,
    importScripts() {},
    setTimeout(callback) {
      callback();
    }
  };
  vm.runInNewContext(source, context, { filename: 'background.js' });
}

test('icon click without save directory opens settings and shows an error badge', async () => {
  const mock = createChromeMock();
  loadBackground(mock);

  assert.equal(mock.actionListeners.length, 1);
  mock.actionListeners[0]({ id: 12 });
  await flush();

  assert.equal(mock.calls.openedOptions, 1);
  assert.deepEqual(plain(mock.calls.badges.at(-1)), { text: 'ERR' });
  assert.equal(mock.calls.nativeMessages.length, 0);
  assert.equal(
    mock.storage.lastStatus.message,
    'Choose a save directory before scraping'
  );
  assert.equal(mock.storage.lastStatus.showInSettings, true);
  assert.deepEqual(plain(mock.calls.titles.at(-1)), {
    title: tooltipTitle('Choose a save directory before scraping')
  });
});

test('icon click scrapes the tab and saves through the native host', async () => {
  const mock = createChromeMock({
    storedSettings: {
      savePath: '/Users/me/Scrapes',
      clipboardMode: 'file',
      openAfterSave: true
    },
    scriptResult: {
      content: '# Saved page',
      filename: 'saved-page.md',
      wordCount: 3
    },
    nativeResponse: {
      success: true,
      path: '/Users/me/Scrapes/saved-page.md',
      copiedFile: true,
      opened: true
    }
  });
  loadBackground(mock);

  mock.actionListeners[0]({ id: 34 });
  await flush();

  assert.equal(mock.calls.scripts.length, 2);
  assert.equal(typeof mock.calls.scripts[0].func, 'function');
  assert.deepEqual(plain({
    target: mock.calls.scripts[0].target,
    args: mock.calls.scripts[0].args
  }), {
    target: { tabId: 34 },
    args: [{
      version: 2,
      redditCommentScoreFilterEnabled: false,
      redditCommentMinScore: 2
    }]
  });
  assert.deepEqual(plain(mock.calls.scripts[1]), {
    target: { tabId: 34 },
    files: ['content.js']
  });
  assert.deepEqual(plain(mock.calls.nativeMessages[0].message), {
    action: 'save',
    directory: '/Users/me/Scrapes',
    filename: 'saved-page.md',
    content: '# Saved page',
    clipboardMode: 'file',
    openAfterSave: true
  });
  assert.deepEqual(plain(mock.calls.badges.at(-1)), { text: '' });
  assert.deepEqual(plain(mock.calls.titles.at(-1)), { title: tooltipTitle('Scrape page') });
});

test('content extraction errors stay on the toolbar without opening settings', async () => {
  const mock = createChromeMock({
    storedSettings: {
      savePath: '/Users/me/Scrapes'
    },
    scriptResult: {
      error: 'No readable content'
    }
  });
  loadBackground(mock);

  mock.actionListeners[0]({ id: 34 });
  await flush();

  assert.equal(mock.calls.openedOptions, 0);
  assert.deepEqual(plain(mock.calls.badges.at(-1)), { text: 'ERR' });
  assert.equal(
    mock.storage.lastStatus.message,
    'Could not extract content. Try a regular web page with readable text'
  );
  assert.equal(mock.storage.lastStatus.showInSettings, false);
  assert.deepEqual(plain(mock.calls.titles.at(-1)), {
    title: tooltipTitle('Could not extract content. Try a regular web page with readable text')
  });
});

test('save directory native errors open settings and mark the status for settings display', async () => {
  const mock = createChromeMock({
    storedSettings: {
      savePath: '/Users/me/Scrapes'
    },
    scriptResult: {
      content: '# Saved page',
      filename: 'saved-page.md'
    },
    nativeResponse: {
      success: false,
      errorCode: 'saveDirectory',
      error: 'Permission denied: /Users/me/Scrapes'
    }
  });
  loadBackground(mock);

  mock.actionListeners[0]({ id: 34 });
  await flush();

  assert.equal(mock.calls.openedOptions, 1);
  assert.deepEqual(plain(mock.calls.badges.at(-1)), { text: 'ERR' });
  assert.equal(
    mock.storage.lastStatus.message,
    'Could not save the file. Permission denied: /Users/me/Scrapes'
  );
  assert.equal(mock.storage.lastStatus.showInSettings, true);
  assert.deepEqual(plain(mock.calls.titles.at(-1)), {
    title: tooltipTitle('Could not save the file. Permission denied: /Users/me/Scrapes')
  });
});

test('save warnings stay on the toolbar without opening settings', async () => {
  const mock = createChromeMock({
    storedSettings: {
      savePath: '/Users/me/Scrapes',
      clipboardMode: 'file'
    },
    scriptResult: {
      content: '# Saved page',
      filename: 'saved-page.md'
    },
    nativeResponse: {
      success: true,
      path: '/Users/me/Scrapes/saved-page.md',
      copyFileError: 'Clipboard blocked'
    }
  });
  loadBackground(mock);

  mock.actionListeners[0]({ id: 34 });
  await flush();

  assert.equal(mock.calls.openedOptions, 0);
  assert.deepEqual(plain(mock.calls.badges.at(-1)), { text: 'WARN' });
  assert.equal(
    mock.storage.lastStatus.message,
    'Saved, but could not copy the file. Clipboard blocked'
  );
  assert.equal(mock.storage.lastStatus.showInSettings, false);
  assert.deepEqual(plain(mock.calls.titles.at(-1)), {
    title: tooltipTitle('Saved, but could not copy the file. Clipboard blocked')
  });
});

test('native host errors stay on the toolbar without a trailing period', async () => {
  const mock = createChromeMock({
    storedSettings: {
      savePath: '/Users/me/Scrapes'
    },
    scriptResult: {
      content: '# Saved page',
      filename: 'saved-page.md'
    },
    nativeLastError: {
      message: 'Specified native messaging host not found.'
    }
  });
  loadBackground(mock);

  mock.actionListeners[0]({ id: 34 });
  await flush();

  const message = 'Native host not found. Run install_host.sh first';
  assert.equal(mock.calls.openedOptions, 0);
  assert.deepEqual(plain(mock.calls.badges.at(-1)), { text: 'ERR' });
  assert.equal(mock.storage.lastStatus.message, message);
  assert.equal(mock.storage.lastStatus.showInSettings, false);
  assert.deepEqual(plain(mock.calls.titles.at(-1)), { title: tooltipTitle(message) });
});

test('chooseDirectory message proxies the fixed native host action', async () => {
  const mock = createChromeMock({
    nativeResponse: {
      success: true,
      directory: '/Users/me/Scrapes'
    }
  });
  loadBackground(mock);

  const response = await waitForMessage(mock.runtimeListeners[0], { action: 'chooseDirectory' });

  assert.deepEqual(plain(response), {
    success: true,
    directory: '/Users/me/Scrapes'
  });
  assert.deepEqual(plain(mock.calls.nativeMessages[0].message), {
    action: 'chooseDirectory'
  });
});

test('chooseDirectory native host errors have no trailing period', async () => {
  const mock = createChromeMock({
    nativeLastError: {
      message: 'Specified native messaging host not found.'
    }
  });
  loadBackground(mock);

  const response = await waitForMessage(mock.runtimeListeners[0], { action: 'chooseDirectory' });

  assert.deepEqual(plain(response), {
    success: false,
    error: 'Native host not found. Run install_host.sh first'
  });
});
