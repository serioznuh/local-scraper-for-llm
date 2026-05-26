importScripts('settings.js');

const NATIVE_HOST = 'com.scraper_llm.host';
const DEFAULT_SAVE_DIR = '';
const ACTION_DEFAULT_TITLE = 'Scrape page';
const ACTION_SCRAPING_TITLE = 'Scraping page';
const ACTION_TOOLTIP_SPACER = '\n ';
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
        clearLastStatus(() => {
          resetActionFeedback();
          callback(settings);
        });
      });
    });
  });
}

function validateSaveMessage(message) {
  if (typeof message.content !== 'string') {
    return 'No Markdown content was provided';
  }
  if (typeof message.filename !== 'string' || !message.filename.trim()) {
    return 'No filename was provided';
  }
  return '';
}

function trimTerminalPeriod(message) {
  return String(message || '').trim().replace(/\.$/, '');
}

function nativeHostNotFoundMessage() {
  return 'Native host not found. Run install_host.sh first';
}

function formatActionTitle(title) {
  return trimTerminalPeriod(title) + ACTION_TOOLTIP_SPACER;
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

function setActionTitle(title) {
  chrome.action.setTitle({ title: formatActionTitle(title) });
}

function resetActionFeedback() {
  setBadge('');
  setActionTitle(ACTION_DEFAULT_TITLE);
}

function startActionFeedback() {
  setBadge('...', '#2672C9');
  setActionTitle(ACTION_SCRAPING_TITLE);
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

function reportError(message, options = {}) {
  const showInSettings = options.showInSettings === true;
  const shouldOpenSettings = options.openSettings === true;
  const cleanMessage = trimTerminalPeriod(message);

  setBadge('ERR', '#B42318');
  setActionTitle(cleanMessage);
  setLastStatus({ state: 'error', message: cleanMessage, showInSettings }, () => {
    if (shouldOpenSettings) openSettings();
  });
}

function reportWarning(message) {
  const cleanMessage = trimTerminalPeriod(message);

  setBadge('WARN', '#A15C00');
  setActionTitle(cleanMessage);
  setLastStatus({ state: 'warning', message: cleanMessage, showInSettings: false });
}

function reportSuccess(message) {
  const cleanMessage = trimTerminalPeriod(message);

  setBadge('OK', '#22863A');
  setActionTitle(ACTION_DEFAULT_TITLE);
  clearLastStatus(() => {
    setLastStatus({ state: 'success', message: cleanMessage, showInSettings: false }, clearBadgeSoon);
  });
}

function buildSaveWarnings(response) {
  const warnings = [];
  if (response.copyTextError) warnings.push('could not copy Markdown text. ' + trimTerminalPeriod(response.copyTextError));
  if (response.copyFileError) warnings.push('could not copy the file. ' + trimTerminalPeriod(response.copyFileError));
  if (response.openError) warnings.push('could not open the file. ' + trimTerminalPeriod(response.openError));
  return warnings;
}

function isSaveDirectoryError(response) {
  return response?.errorCode === 'saveDirectory';
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
      reportError(nativeHostNotFoundMessage());
      return;
    }

    if (!response?.success) {
      const detail = trimTerminalPeriod(response?.error || 'Check your save directory and native host');
      const message = 'Could not save the file. ' + detail;
      const showInSettings = isSaveDirectoryError(response);
      reportError(message, {
        showInSettings,
        openSettings: showInSettings
      });
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

function applyScraperSettings(settings) {
  globalThis.__scraperSettings = settings;
}

function buildContentScriptSettings(settings) {
  return {
    version: settings.version,
    redditCommentScoreFilterEnabled: settings.redditCommentScoreFilterEnabled,
    redditCommentMinScore: settings.redditCommentMinScore,
    redditTrivialCommentFilterEnabled: settings.redditTrivialCommentFilterEnabled
  };
}

function scrapeTab(tab) {
  loadSettings((settings) => {
    if (!settings.savePath) {
      reportError('Choose a save directory before scraping', {
        showInSettings: true,
        openSettings: true
      });
      return;
    }

    if (!tab?.id) {
      reportError('No active tab is available to scrape');
      return;
    }

    startActionFeedback();
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applyScraperSettings,
      args: [buildContentScriptSettings(settings)]
    }, (results) => {
      if (chrome.runtime.lastError) {
        reportError('Could not read this page. ' + trimTerminalPeriod(chrome.runtime.lastError.message));
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }, (contentResults) => {
        if (chrome.runtime.lastError) {
          reportError('Could not read this page. ' + trimTerminalPeriod(chrome.runtime.lastError.message));
          return;
        }

        const data = contentResults?.[0]?.result;
        if (!data || data.error) {
          reportError('Could not extract content. Try a regular web page with readable text');
          return;
        }

        saveScrapeResult(data, settings);
      });
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
          error: nativeHostNotFoundMessage()
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
