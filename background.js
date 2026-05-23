importScripts('settings.js');

const NATIVE_HOST = 'com.scraper_llm.host';
const DEFAULT_SAVE_DIR = '';
const SETTINGS_KEY = ScraperSettings.STORAGE_KEY;
const LAST_STATUS_KEY = 'lastStatus';
const BADGE_DURATION_MS = 2200;

function loadSettings(callback) {
  chrome.storage.local.get([SETTINGS_KEY, 'savePath'], (result) => {
    const settings = ScraperSettings.normalizeSettings(result[SETTINGS_KEY], result.savePath || DEFAULT_SAVE_DIR);
    if (!result[SETTINGS_KEY] && result.savePath) {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
        chrome.storage.local.remove('savePath', () => callback(settings));
      });
      return;
    }
    callback(settings);
  });
}

function persistSettings(patch, callback) {
  loadSettings((currentSettings) => {
    const settings = ScraperSettings.mergeSettings(currentSettings, patch);
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
      chrome.storage.local.remove('savePath', () => {
        clearLastStatus(() => callback(settings));
      });
    });
  });
}

function validateSaveMessage(message) {
  if (typeof message.content !== 'string') {
    return 'No Markdown content was provided.';
  }
  if (typeof message.filename !== 'string' || !message.filename.trim()) {
    return 'No filename was provided.';
  }
  return '';
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

function clearBadgeSoon() {
  setTimeout(() => setBadge(''), BADGE_DURATION_MS);
}

function setLastStatus(status, callback = () => {}) {
  chrome.storage.local.set({
    [LAST_STATUS_KEY]: Object.assign({
      timestamp: Date.now()
    }, status)
  }, callback);
}

function clearLastStatus(callback = () => {}) {
  chrome.storage.local.remove(LAST_STATUS_KEY, callback);
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function reportError(message, shouldOpenSettings = true) {
  setBadge('ERR', '#B42318');
  setLastStatus({ state: 'error', message }, () => {
    if (shouldOpenSettings) openSettings();
  });
}

function reportWarning(message) {
  setBadge('WARN', '#A15C00');
  setLastStatus({ state: 'warning', message }, clearBadgeSoon);
}

function reportSuccess(message) {
  setBadge('OK', '#22863A');
  clearLastStatus(() => {
    setLastStatus({ state: 'success', message }, clearBadgeSoon);
  });
}

function buildSaveWarnings(response) {
  const warnings = [];
  if (response.copyTextError) warnings.push('could not copy Markdown text. ' + response.copyTextError);
  if (response.copyFileError) warnings.push('could not copy the file. ' + response.copyFileError);
  if (response.openError) warnings.push('could not open the file. ' + response.openError);
  return warnings;
}

function saveScrapeResult(data, settings) {
  const validationError = validateSaveMessage(data);
  if (validationError) {
    reportError(validationError);
    return;
  }

  chrome.runtime.sendNativeMessage(NATIVE_HOST, {
    action: 'save',
    directory: settings.savePath || DEFAULT_SAVE_DIR,
    filename: data.filename,
    content: data.content,
    clipboardMode: settings.clipboardMode,
    openAfterSave: settings.openAfterSave
  }, (response) => {
    if (chrome.runtime.lastError) {
      reportError('Native host not found. Run install_host.sh first. (' + chrome.runtime.lastError.message + ')');
      return;
    }

    if (!response?.success) {
      reportError('Could not save the file. ' + (response?.error || 'Check your save directory and native host.'));
      return;
    }

    const warnings = buildSaveWarnings(response);
    if (warnings.length) {
      reportWarning('Saved, but ' + warnings.join(' '));
      return;
    }

    reportSuccess('Saved: ' + (response.path || data.filename));
  });
}

function scrapeTab(tab) {
  loadSettings((settings) => {
    if (!settings.savePath) {
      reportError('Choose a save directory before scraping.');
      return;
    }

    if (!tab?.id) {
      reportError('No active tab is available to scrape.');
      return;
    }

    setBadge('...', '#2672C9');
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, (results) => {
      if (chrome.runtime.lastError) {
        reportError('Could not read this page. ' + chrome.runtime.lastError.message);
        return;
      }

      const data = results?.[0]?.result;
      if (!data || data.error) {
        reportError('Could not extract content. Try a regular web page with readable text.');
        return;
      }

      saveScrapeResult(data, settings);
    });
  });
}

chrome.action.onClicked.addListener((tab) => {
  scrapeTab(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'chooseDirectory') {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      action: 'chooseDirectory'
    }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: 'Native host not found. Run install_host.sh first. (' + chrome.runtime.lastError.message + ')'
        });
        return;
      }
      sendResponse(response);
    });
    return true;
  }

  if (message.action === 'getSettings') {
    loadSettings((settings) => {
      chrome.storage.local.get([LAST_STATUS_KEY], (result) => {
        sendResponse({
          settings,
          savePath: settings.savePath,
          clipboardMode: settings.clipboardMode,
          openAfterSave: settings.openAfterSave,
          lastStatus: result[LAST_STATUS_KEY] || null
        });
      });
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    const patch = message.settings || {
      savePath: message.savePath,
      clipboardMode: message.clipboardMode,
      openAfterSave: message.openAfterSave
    };
    persistSettings(patch, (settings) => {
      sendResponse({ success: true, settings });
    });
    return true;
  }
});
