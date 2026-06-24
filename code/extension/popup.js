document.addEventListener('DOMContentLoaded', () => {
  const cb7th = document.getElementById('chord-7th');
  const cbSus = document.getElementById('chord-sus');
  const wakeWordInput = document.getElementById('wake-word-input');
  const wakeWordDisplays = document.querySelectorAll('.wake-word-display');

  // Accordion Toggle Logic
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      item.classList.toggle('active');
    });
  });

  // Helper to update help commands text
  function updateWakeWordDisplay(val) {
    const displayVal = val.trim() || 'Rockstar';
    wakeWordDisplays.forEach(el => {
      el.textContent = displayVal;
    });
  }

  // Load settings
  chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord'], (result) => {
    cb7th.checked = result.chord7th || false;
    cbSus.checked = result.chordSus || false;
    
    const word = result.wakeWord !== undefined ? result.wakeWord : 'Rockstar';
    wakeWordInput.value = word;
    updateWakeWordDisplay(word);
  });

  // Save chord settings
  cb7th.addEventListener('change', () => {
    chrome.storage.sync.set({ chord7th: cb7th.checked });
  });

  cbSus.addEventListener('change', () => {
    chrome.storage.sync.set({ chordSus: cbSus.checked });
  });

  // Save wake word setting
  wakeWordInput.addEventListener('input', () => {
    const val = wakeWordInput.value;
    chrome.storage.sync.set({ wakeWord: val });
    updateWakeWordDisplay(val);
  });
});
