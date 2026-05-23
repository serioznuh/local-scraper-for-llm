document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const savePathInput = document.getElementById('savePath');
  const chooseDirectoryButton = document.getElementById('chooseDirectoryBtn');
  const clipboardModeInputs = Array.from(document.querySelectorAll('input[name="clipboardMode"]'));
  const openAfterSaveInput = document.getElementById('openAfterSave');
  const saveButton = document.getElementById('saveSettingsBtn');
  const toast = document.getElementById('toast');
  const unsavedChangesToast = document.getElementById('unsavedChangesToast');
  const banner = document.getElementById('banner');
  let savedSettings = null;
  let bannerTimer = 0;
  let toastTimer = 0;

  function hideBanner() {
    banner.hidden = true;
    banner.textContent = '';
    banner.className = 'banner';
  }

  function trimTerminalPeriod(message) {
    return String(message || '').trim().replace(/\.$/, '');
  }

  function showBanner(message, state = 'info', autoHide = false) {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = 0;
    }
    banner.textContent = trimTerminalPeriod(message);
    banner.className = `banner ${state}`;
    banner.hidden = false;
    if (autoHide) {
      bannerTimer = setTimeout(hideBanner, 2600);
    }
  }

  function hideToast() {
    toast.hidden = true;
    toast.textContent = '';
    toast.className = 'toast banner';
  }

  function showToast(message, state = 'info', autoHide = false) {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    toast.textContent = trimTerminalPeriod(message);
    toast.className = `toast banner ${state}`;
    toast.hidden = false;
    if (autoHide) {
      toastTimer = setTimeout(hideToast, 2600);
    }
  }

  function setBusy(isBusy) {
    saveButton.disabled = isBusy;
    saveButton.textContent = isBusy ? 'Saving...' : 'Save Settings';
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

  function settingsAreEqual(a, b) {
    return a.savePath === b.savePath &&
      a.clipboardMode === b.clipboardMode &&
      a.openAfterSave === b.openAfterSave;
  }

  function updateUnsavedState() {
    const hasUnsavedChanges = Boolean(savedSettings && !settingsAreEqual(readFormSettings(), savedSettings));
    unsavedChangesToast.textContent = 'Unsaved changes';
    unsavedChangesToast.className = 'toast banner warning';
    unsavedChangesToast.hidden = !hasUnsavedChanges;
  }

  function shouldShowStoredStatus(status) {
    return Boolean(status?.message && status.showInSettings === true);
  }

  function renderStoredStatus(status) {
    if (shouldShowStoredStatus(status)) {
      showBanner(status.message, status.state || 'info');
    } else {
      hideBanner();
    }
  }

  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.lastStatus) {
        renderStoredStatus(changes.lastStatus.newValue);
      }
    });
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    savedSettings = ScraperSettings.normalizeSettings(response?.settings || response);
    renderSettings(savedSettings);
    updateUnsavedState();
    renderStoredStatus(response?.lastStatus);
  } catch (e) {
    showBanner('Could not load settings, reload the extension and try again', 'error');
  }

  savePathInput.addEventListener('input', updateUnsavedState);
  for (const input of clipboardModeInputs) {
    input.addEventListener('change', updateUnsavedState);
  }
  openAfterSaveInput.addEventListener('change', updateUnsavedState);

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
      updateUnsavedState();
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

      savedSettings = ScraperSettings.normalizeSettings(response.settings);
      renderSettings(savedSettings);
      updateUnsavedState();
      showToast('Settings saved', 'success', true);
    } catch (e) {
      showBanner('Could not save settings, reload the extension and try again', 'error');
    } finally {
      setBusy(false);
    }
  });
});
