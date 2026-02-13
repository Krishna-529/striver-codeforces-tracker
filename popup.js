document.addEventListener('DOMContentLoaded', () => {
  const handleInput = document.getElementById('handle');
  const statusDiv = document.getElementById('status');

  // Load saved handle if it exists
  chrome.storage.sync.get(['cfHandle'], (result) => {
    if (result.cfHandle) {
      handleInput.value = result.cfHandle;
    }
  });

  // Save handle when button is clicked
  document.getElementById('saveBtn').addEventListener('click', () => {
    const handle = handleInput.value.trim();
    if (handle) {
      chrome.storage.sync.set({ cfHandle: handle }, () => {
        statusDiv.textContent = 'Saved! Refresh the sheet.';
        setTimeout(() => { statusDiv.textContent = ''; }, 2000);
      });
    }
  });
});