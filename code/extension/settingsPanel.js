/**
 * settingsPanel.js — logique du menu des paramètres, partagée entre le popup
 * (popup.html) et le panneau (onglet ⚙ du side panel).
 *
 * Chaque contrôle est optionnel : un élément absent est ignoré, ce qui permet
 * à une page d'embarquer seulement une partie des sections. La persistance
 * passe par chrome.storage.sync (mêmes clés que l'historique popup).
 */
document.addEventListener('DOMContentLoaded', () => {
  const cb7th = document.getElementById('chord-7th');
  const cbSus = document.getElementById('chord-sus');
  const wakeWordInput = document.getElementById('wake-word-input');
  const wakeWordVariantsInput = document.getElementById('wake-word-variants-input');
  const wakeWordDisplays = document.querySelectorAll('.wake-word-display');

  const domainActivationGroup = document.getElementById('domain-activation-group');
  const domainActivationCb = document.getElementById('domain-activation-cb');
  const domainActivationLabel = document.getElementById('domain-activation-label');
  const muteAllSitesCb = document.getElementById('mute-all-sites-cb');
  const inactivityDelaySelect = document.getElementById('inactivity-delay-select');
  const wakeActiveDurationSelect = document.getElementById('wake-active-duration-select');

  let currentDomain = '';

  // Accordion Toggle Logic
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      item.classList.toggle('active');
    });
  });

  // Helper to update help commands text
  function updateWakeWordDisplay(val) {
    const displayVal = val.trim() || 'Roddy';
    wakeWordDisplays.forEach((el) => {
      el.textContent = displayVal;
    });
  }

  // Identify active tab and handle domain specific checkbox
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const urlObj = new URL(tabs[0].url);
          currentDomain = urlObj.hostname;

          const isUG = currentDomain.endsWith('ultimate-guitar.com');
          if (!isUG && currentDomain && urlObj.protocol.startsWith('http') && domainActivationGroup) {
            domainActivationLabel.textContent = `Activer sur ${currentDomain}`;
            domainActivationGroup.style.display = 'flex';

            chrome.storage.sync.get('allowedDomains', (result) => {
              const allowedDomains = result.allowedDomains || {};
              const isChecked = allowedDomains[currentDomain] === true;
              domainActivationCb.checked = isChecked;

              if (isChecked) {
                const originPattern1 = `http://${currentDomain}/*`;
                const originPattern2 = `https://${currentDomain}/*`;
                const scriptId = `rockstar-dynamic-${currentDomain.replace(/[^a-z0-9]/gi, '-')}`;

                // Vérifier si le script dynamique est déjà enregistré, sinon le réenregistrer
                chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] }, (registered) => {
                  if (!registered || registered.length === 0) {
                    chrome.scripting.registerContentScripts([{
                      id: scriptId,
                      matches: [originPattern1, originPattern2],
                      js: [
                        "storageService.js",
                        "core.js",
                        "voiceEngine.js",
                        "widgets/floatingBar.js",
                        "widgets/scroll.js",
                        "widgets/metronome.js",
                        "widgets/tuner.js",
                        "widgets/chordDetector.js",
                        "widgets/repertoireDrawer.js",
                        "widgets/youtubeController.js",
                        "widgets/singingTracker.js",
                        "widgets/onboarding.js"
                      ],
                      css: ["content.css"],
                      runAt: "document_idle"
                    }]).catch(err => {
                      console.error("Auto registration of dynamic content script failed:", err);
                    });
                  }
                });
              }
            });
          }
        } catch (e) {
          console.error("Error parsing tab URL", e);
        }
      }
    });
  }

  if (!cb7th || !cbSus || !wakeWordInput || !wakeWordVariantsInput || !muteAllSitesCb || !inactivityDelaySelect || !wakeActiveDurationSelect) {
    return;
  }

  // Load settings
  chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord', 'wakeWordVariants', 'muteAllSites', 'inactivityDelay', 'wakeActiveDuration'], (result) => {
    cb7th.checked = result.chord7th || false;
    cbSus.checked = result.chordSus || false;
    muteAllSitesCb.checked = result.muteAllSites || false;
    inactivityDelaySelect.value = result.inactivityDelay !== undefined ? result.inactivityDelay : '1';
    wakeActiveDurationSelect.value = result.wakeActiveDuration !== undefined ? result.wakeActiveDuration : '10';

    const word = result.wakeWord !== undefined ? result.wakeWord : 'Roddy';
    wakeWordInput.value = word;
    updateWakeWordDisplay(word);

    const variants = result.wakeWordVariants !== undefined ? result.wakeWordVariants : 'roadie, roady, rody, rhody, ruddy, rudy, rodi, roddi, redis, kodi';
    wakeWordVariantsInput.value = variants;
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

  // Save wake word variants setting
  wakeWordVariantsInput.addEventListener('input', () => {
    const val = wakeWordVariantsInput.value;
    chrome.storage.sync.set({ wakeWordVariants: val });
  });

  // Save domain activation setting and register/unregister dynamic content scripts
  if (domainActivationCb) {
    domainActivationCb.addEventListener('change', () => {
      if (!currentDomain) return;

      const originPattern1 = `http://${currentDomain}/*`;
      const originPattern2 = `https://${currentDomain}/*`;
      const scriptId = `rockstar-dynamic-${currentDomain.replace(/[^a-z0-9]/gi, '-')}`;

      if (domainActivationCb.checked) {
        // Demander l'autorisation pour ce domaine
        chrome.permissions.request({
          origins: [originPattern1, originPattern2]
        }, (granted) => {
          if (granted) {
            // Enregistrer dans le stockage sync
            chrome.storage.sync.get('allowedDomains', (result) => {
              const allowedDomains = result.allowedDomains || {};
              allowedDomains[currentDomain] = true;
              chrome.storage.sync.set({ allowedDomains });
            });

            // Enregistrer dynamiquement les scripts pour ce domaine
            chrome.scripting.registerContentScripts([{
              id: scriptId,
              matches: [originPattern1, originPattern2],
              js: [
                "storageService.js",
                "core.js",
                "voiceEngine.js",
                "widgets/floatingBar.js",
                "widgets/scroll.js",
                "widgets/metronome.js",
                "widgets/tuner.js",
                "widgets/chordDetector.js",
                "widgets/repertoireDrawer.js",
                "widgets/youtubeController.js",
                "widgets/singingTracker.js",
                "widgets/onboarding.js"
              ],
              css: ["content.css"],
              runAt: "document_idle"
            }]).catch(err => {
              console.error(`Failed to register dynamic content scripts for ${currentDomain}:`, err);
            });
          } else {
            // Si l'utilisateur refuse la permission, décocher
            domainActivationCb.checked = false;
          }
        });
      } else {
        // Retirer du stockage sync
        chrome.storage.sync.get('allowedDomains', (result) => {
          const allowedDomains = result.allowedDomains || {};
          delete allowedDomains[currentDomain];
          chrome.storage.sync.set({ allowedDomains });
        });

        // Désenregistrer le script dynamique
        chrome.scripting.unregisterContentScripts({ ids: [scriptId] })
          .catch(err => {
            console.warn(`Unregistering scripts for ${currentDomain} failed or none was active:`, err);
          });

        // Retirer les permissions du domaine
        chrome.permissions.remove({
          origins: [originPattern1, originPattern2]
        });
      }
    });
  }

  // Save mute settings
  muteAllSitesCb.addEventListener('change', () => {
    chrome.storage.sync.set({ muteAllSites: muteAllSitesCb.checked });
  });

  // Save inactivity delay setting
  inactivityDelaySelect.addEventListener('change', () => {
    chrome.storage.sync.set({ inactivityDelay: parseInt(inactivityDelaySelect.value, 10) });
  });

  // Save wake active duration setting
  wakeActiveDurationSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ wakeActiveDuration: parseInt(wakeActiveDurationSelect.value, 10) });
  });
});