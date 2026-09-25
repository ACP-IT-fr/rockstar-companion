/**
 * background.js — Service worker (MV3) : hub de communication.
 *
 * Rôles :
 *  1. Ouvrir le side panel au clic sur l'icône de l'extension.
 *  2. Router les messages entre le side panel et les content scripts.
 *
 * Le side panel (sidepanel.html) ne partage pas le DOM avec la page :
 * toute action sur la page (scroll, contrôles YouTube, extraction d'accords)
 * passe par ce hub via chrome.tabs.sendMessage, et les événements de la page
 * (état de lecture, etc.) reviennent au panneau via chrome.runtime.sendMessage.
 */

// Panneau ouvert au clic sur l'icône (comportement déclaré à l'install
// et réappliqué au démarrage du service worker pour rester robuste).
function enableOpenOnActionClick() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('[VoxRoddy BG] setPanelBehavior:', e));
}
chrome.runtime.onInstalled.addListener(enableOpenOnActionClick);
enableOpenOnActionClick();

/**
 * Hub de messages. Conventions :
 *  - { type: 'rockstar:open-panel' }        → ouvrir le panneau (depuis un bouton de page)
 *  - { type: 'rockstar:panel-to-tab', payload } → panneau → onglet actif (action sur la page)
 *  - { type: 'rockstar:tab-to-panel', payload } → onglet → panneau (état / données)
 *  - { type: 'rockstar:tab-event', payload }    → broadcast reçu par le panneau
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('rockstar:')) return;

  switch (msg.type) {
    case 'rockstar:open-panel': {
      // kind='toggle' : si le panneau est ouvert, il se ferme lui-même
      // (window.close() après réception de rockstar:panel-toggle) ; sinon on
      // l'ouvre. Le message vers le panneau échoue s'il n'y a pas de
      // récepteur, ce qui sert de test "panneau ouvert ?".
      if (msg.kind === 'toggle') {
        chrome.runtime
          .sendMessage({ type: 'rockstar:panel-toggle' })
          .then(() => { /* panneau ouvert : il se ferme tout seul */ })
          .catch(() => {
            const tabId = sender.tab ? sender.tab.id : (msg.tabId ?? null);
            if (tabId != null) {
              chrome.sidePanel
                .open({ tabId })
                .catch((e) => console.error('[VoxRoddy BG] sidePanel.open:', e));
            }
          });
        sendResponse({ ok: true });
        break;
      }
      const tabId = sender.tab ? sender.tab.id : (msg.tabId ?? null);
      if (tabId != null) {
        chrome.sidePanel
          .open({ tabId })
          .catch((e) => console.error('[VoxRoddy BG] sidePanel.open:', e));
      }
      sendResponse({ ok: true });
      break;
    }

    case 'rockstar:panel-to-tab': {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab) {
          sendResponse({ ok: false, error: 'no-active-tab' });
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: 'rockstar:tab-action', payload: msg.payload }, (res) => {
          // L'onglet peut ne pas avoir le content script (page interne).
          if (chrome.runtime.lastError) {
            void chrome.runtime.lastError;
            sendResponse({ ok: false, error: 'no-content-script' });
            return;
          }
          sendResponse(res || { ok: false, error: 'no-response' });
        });
      });
      return true; // réponse asynchrone
    }

    case 'rockstar:tab-to-panel': {
      // Broadcast vers tous les contextes d'extension (le panneau est un
      // document d'extension : il reçoit runtime.sendMessage).
      chrome.runtime
        .sendMessage({ type: 'rockstar:tab-event', payload: msg.payload })
        .catch(() => {});
      sendResponse({ ok: true });
      break;
    }
  }
});