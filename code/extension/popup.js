document.addEventListener('DOMContentLoaded', () => {
  const cb7th = document.getElementById('chord-7th');
  const cbSus = document.getElementById('chord-sus');
  const wakeWordInput = document.getElementById('wake-word-input');
  const wakeWordDisplays = document.querySelectorAll('.wake-word-display');
  
  const domainActivationGroup = document.getElementById('domain-activation-group');
  const domainActivationCb = document.getElementById('domain-activation-cb');
  const domainActivationLabel = document.getElementById('domain-activation-label');
  const muteAllSitesCb = document.getElementById('mute-all-sites-cb');

  let currentDomain = '';

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

  // Identify active tab and handle domain specific checkbox
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      try {
        const urlObj = new URL(tabs[0].url);
        currentDomain = urlObj.hostname;
        
        const isUG = currentDomain.endsWith('ultimate-guitar.com');
        if (!isUG && currentDomain && urlObj.protocol.startsWith('http')) {
          domainActivationLabel.textContent = `Activer sur ${currentDomain}`;
          domainActivationGroup.style.display = 'flex';
          
          chrome.storage.sync.get('allowedDomains', (result) => {
            const allowedDomains = result.allowedDomains || {};
            domainActivationCb.checked = allowedDomains[currentDomain] === true;
          });
        }
      } catch (e) {
        console.error("Error parsing tab URL", e);
      }
    }
  });

  // Load settings
  chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord', 'muteAllSites'], (result) => {
    cb7th.checked = result.chord7th || false;
    cbSus.checked = result.chordSus || false;
    muteAllSitesCb.checked = result.muteAllSites || false;
    
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

  // Save domain activation setting
  domainActivationCb.addEventListener('change', () => {
    if (!currentDomain) return;
    chrome.storage.sync.get('allowedDomains', (result) => {
      const allowedDomains = result.allowedDomains || {};
      allowedDomains[currentDomain] = domainActivationCb.checked;
      chrome.storage.sync.set({ allowedDomains });
    });
  });

  // Save mute settings
  muteAllSitesCb.addEventListener('change', () => {
    chrome.storage.sync.set({ muteAllSites: muteAllSitesCb.checked });
  });

  // Open Dashboard Page
  const openDashboardBtn = document.getElementById('open-dashboard-btn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }
});
