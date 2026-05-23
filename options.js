document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const savePathInput = document.getElementById('savePath');
  const chooseDirectoryButton = document.getElementById('chooseDirectoryBtn');
  const clipboardModeInputs = Array.from(document.querySelectorAll('input[name="clipboardMode"]'));
  const openAfterSaveInput = document.getElementById('openAfterSave');
  const saveButton = document.getElementById('saveSettingsBtn');
  const banner = document.getElementById('banner');
  let bannerTimer = 0;

  function hideBanner() {
    banner.hidden = true;
    banner.textContent = '';
    banner.className = 'banner';
  }

  function showBanner(message, state = 'info', autoHide = false) {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = 0;
    }
    banner.textContent = message;
    banner.className = `banner ${state}`;
    banner.hidden = false;
    if (autoHide) {
      bannerTimer = setTimeout(hideBanner, 2600);
    }
  }

  function setBusy(isBusy) {
    saveButton.disabled = isBusy;
    saveButton.textContent = isBusy ? 'Saving...' : 'Save settings';
  }

  function setDirectoryBusy(isBusy) {
    chooseDirectoryButton.disabled = isBusy;
  }

  function readFormSettings() {
    const selectedClipboardMode = clipboardModeInputs.find(input => input.checked)?.value || 'off';
    return ScraperSettings.normalizeSettings({
      savePath: savePathInput.value,
      clipboardMode: selectedClipboardMode,
      openAfterSave: openAfterSaveInput.checked
    });
  }

  function renderSettings(settings) {
    savePathInput.value = settings.savePath;
    for (const input of clipboardModeInputs) {
      input.checked = input.value === settings.clipboardMode;
    }
    openAfterSaveInput.checked = settings.openAfterSave;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    renderSettings(ScraperSettings.normalizeSettings(response?.settings || response));
    if (response?.lastStatus?.message) {
      showBanner(response.lastStatus.message, response.lastStatus.state || 'info', response.lastStatus.state === 'success');
    } else {
      hideBanner();
    }
  } catch (e) {
    showBanner('Could not load settings, reload the extension and try again', 'error');
  }

  chooseDirectoryButton.addEventListener('click', async () => {
    setDirectoryBusy(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'chooseDirectory' });
      if (response?.cancelled) {
        hideBanner();
        return;
      }
      if (!response?.success) {
        showBanner(response?.error || 'Could not choose a folder', 'error');
        return;
      }
      savePathInput.value = response.directory || '';
      savePathInput.focus();
    } catch (e) {
      showBanner('Could not choose a folder, reload the extension and try again', 'error');
    } finally {
      setDirectoryBusy(false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: readFormSettings()
      });

      if (!response?.success) {
        showBanner('Could not save settings, try again', 'error');
        return;
      }

      renderSettings(ScraperSettings.normalizeSettings(response.settings));
      showBanner('Settings saved', 'success', true);
    } catch (e) {
      showBanner('Could not save settings, reload the extension and try again', 'error');
    } finally {
      setBusy(false);
    }
  });
});
