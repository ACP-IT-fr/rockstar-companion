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
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      item.classList.toggle('active');
    });
  });

  // Helper to update help commands text
  function updateWakeWordDisplay(val) {
    const displayVal = val.trim() || 'Roddy';
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
                      "widgets/singingTracker.js"
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
              "widgets/singingTracker.js"
            ],
            css: ["content.css"],
            runAt: "document_idle"
          }]).then(() => {
          }).catch(err => {
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
        .then(() => {
        })
        .catch(err => {
          console.warn(`Unregistering scripts for ${currentDomain} failed or none was active:`, err);
        });

      // Retirer les permissions du domaine
      chrome.permissions.remove({
        origins: [originPattern1, originPattern2]
      });
    }
  });

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

  // Open Dashboard Page
  const openDashboardBtn = document.getElementById('open-dashboard-btn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }

  // Inject Assistant dynamic scripts via activeTab (or Deactivate if already active)
  const injectBtn = document.getElementById('inject-assistant-btn');
  let isCoreActiveOnTab = false;

  if (injectBtn) {
    // Check if Rockstar is already active on the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tabId = tabs[0].id;
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            return typeof window.RockstarCore !== 'undefined' && window.RockstarCore.isInitialized === true;
          }
        }).then((results) => {
          if (results && results[0] && results[0].result === true) {
            isCoreActiveOnTab = true;
            injectBtn.innerText = "🛑 Désactiver sur cet onglet";
            injectBtn.style.background = "#ef4444";
          }
        }).catch(err => {
        });
      }
    });

    injectBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
          console.error("No active tab found");
          return;
        }
        const tabId = tabs[0].id;

        if (isCoreActiveOnTab) {
          // DEACTIVATION
          injectBtn.innerText = "⏳ Désactivation...";
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              if (window.RockstarCore) {
                // Stop listening
                if (typeof window.RockstarCore.stopListening === 'function') {
                  window.RockstarCore.stopListening();
                }
                // Close/suspend audio context if any
                if (typeof window.RockstarCore.getAudioContext === 'function') {
                  try {
                    const ctx = window.RockstarCore.getAudioContext();
                    if (ctx && typeof ctx.close === 'function') {
                      ctx.close().catch(() => {});
                    }
                  } catch (e) {}
                }
              }

              // List of DOM elements to remove
              const elementsToRemove = [
                'rockstar-floating-bar',
                'ug-chord',
                'ug-tuner',
                'ug-singing-tracker',
                'ug-metronome',
                'ug-metronome-screen-overlay',
                'rockstar-drawer',
                'ug-drawer-btn',
                'rockstar-banner'
              ];

              elementsToRemove.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
              });

              // Delete global RockstarCore object
              delete window.RockstarCore;
            }
          }).then(() => {
            injectBtn.innerText = "🎙️ Activer sur cet onglet";
            injectBtn.style.background = "var(--accent-gradient)";
            isCoreActiveOnTab = false;
          }).catch(err => {
            console.error("Deactivation failed: ", err);
            injectBtn.innerText = "❌ Échec de désactivation";
            injectBtn.style.background = "#ef4444";
          });
        } else {
          // ACTIVATION
          injectBtn.innerText = "⏳ Injection...";
          
          // 1. Ingestion CSS
          chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ["content.css"]
          }).then(() => {
            // Définir le flag pour indiquer qu'une injection dynamique est en cours
            return chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => { window.__rockstarDynamicInjectionInProgress = true; }
            });
          }).then(() => {
            // 2. Sequential JS Injections to respect dependencies (storageService -> core -> others)
            const jsFiles = [
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
              "widgets/singingTracker.js"
            ];
            
            // Helper to chain promises sequentially
            return jsFiles.reduce((promise, file) => {
              return promise.then(() => {
                return chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: [file]
                });
              });
            }, Promise.resolve());
          }).then(() => {
            return chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => {
                // Nettoyer le flag temporaire
                delete window.__rockstarDynamicInjectionInProgress;
                if (window.RockstarCore && typeof window.RockstarCore.initialize === 'function') {
                  window.RockstarCore.initialize();
                } else {
                  console.error("[RockstarPopup] RockstarCore not found on active tab.");
                }
              }
            });
          }).then(() => {
            injectBtn.innerText = "✅ Activé !";
            injectBtn.style.background = "#10b981";
            isCoreActiveOnTab = true;
            setTimeout(() => {
              window.close(); // Close the popup
            }, 800);
          }).catch(err => {
            console.error("Injection failed entirely: ", err);
            injectBtn.innerText = "❌ Échec (" + (err.message || "erreur") + ")";
            injectBtn.style.background = "#ef4444";
          });
        }
      });
    });
  }
});
