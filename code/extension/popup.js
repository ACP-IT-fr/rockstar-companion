document.addEventListener('DOMContentLoaded', () => {
  const cb7th = document.getElementById('chord-7th');
  const cbSus = document.getElementById('chord-sus');

  // Load settings
  chrome.storage.sync.get(['chord7th', 'chordSus'], (result) => {
    // Defaults: unchecked
    cb7th.checked = result.chord7th || false;
    cbSus.checked = result.chordSus || false;
  });

  // Save settings
  cb7th.addEventListener('change', () => {
    chrome.storage.sync.set({ chord7th: cb7th.checked });
  });

  cbSus.addEventListener('change', () => {
    chrome.storage.sync.set({ chordSus: cbSus.checked });
  });
});
