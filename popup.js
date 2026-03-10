document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const savePathInput = document.getElementById('savePath');

  // Load saved path on popup open
  try {
    const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
    savePathInput.value = settings.savePath;
  } catch (e) {
    savePathInput.placeholder = 'Could not load settings';
  }

  // Update save path
  document.getElementById('savePathBtn').addEventListener('click', async () => {
    const path = savePathInput.value.trim();
    if (!path) return;
    await chrome.runtime.sendMessage({ action: 'saveSettings', savePath: path });
    statusDiv.textContent = 'Path updated!';
    statusDiv.className = 'success';
    setTimeout(() => { statusDiv.textContent = 'Ready'; statusDiv.className = ''; }, 2000);
  });

  // Scrape article
  document.getElementById('scrapeBtn').addEventListener('click', async () => {
    statusDiv.textContent = 'Scraping...';
    statusDiv.className = '';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      const data = results[0]?.result;

      if (!data || data.error) {
        statusDiv.textContent = 'Error: ' + (data?.error || 'No content extracted');
        statusDiv.className = 'error';
        return;
      }

      statusDiv.textContent = `${data.wordCount} words extracted. Saving...`;

      const response = await chrome.runtime.sendMessage({
        action: 'save',
        content: data.content,
        filename: data.filename
      });

      if (response.success) {
        statusDiv.textContent = `Saved: ${data.filename}`;
        statusDiv.className = 'success';
      } else {
        statusDiv.textContent = 'Error: ' + response.error;
        statusDiv.className = 'error';
      }
    } catch (err) {
      statusDiv.textContent = 'Error: ' + err.message;
      statusDiv.className = 'error';
    }
  });
});
