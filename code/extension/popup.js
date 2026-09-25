/**
 * popup.js — actions propres au popup (ouvrir le dashboard, activer/désactiver
 * l'assistant sur l'onglet actif). Les paramètres (accordéons) sont gérés par
 * settingsPanel.js, chargé sur les deux surfaces.
 */
document.addEventListener('DOMContentLoaded', () => {
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
                'ug-voice-btn',
                'ug-voice-live-text',
                'ug-song-summary-bar',
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

              // Retirer la classe de position de la barre (haut/bas)
              document.body.classList.remove('rockstar-bar-top', 'rockstar-bar-bottom', 'rockstar-bar-left', 'rockstar-bar-right');
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
              "widgets/singingTracker.js",
              "widgets/onboarding.js"
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