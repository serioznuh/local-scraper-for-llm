const NATIVE_HOST = 'com.scraper_llm.host';
const DEFAULT_SAVE_DIR = '';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'save') {
    chrome.storage.local.get(['savePath'], (result) => {
      const directory = result.savePath || DEFAULT_SAVE_DIR;

      if (!directory) {
        sendResponse({
          success: false,
          error: 'Save directory is not set. Open the extension popup and choose a local folder first.'
        });
        return;
      }

      chrome.runtime.sendNativeMessage(NATIVE_HOST, {
        action: 'save',
        directory: directory,
        filename: message.filename,
        content: message.content
      }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: 'Native host not found. Run install_host.sh first. (' + chrome.runtime.lastError.message + ')'
          });
        } else {
          sendResponse(response);
        }
      });
    });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get(['savePath'], (result) => {
      sendResponse({ savePath: result.savePath || DEFAULT_SAVE_DIR });
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    chrome.storage.local.set({ savePath: message.savePath }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
