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

// --- Synchro Drive automatique ----------------------------------------------
// Le répertoire change (ajout, édition, suppression n'importe où dans
// l'extension) → synchro différée avec Drive, en silence : jamais de popup
// (si l'utilisateur n'a pas encore autorisé l'accès, on attend sa première
// synchro manuelle via le bouton « Drive »).
importScripts('driveSyncService.js');
const AUTO_SYNC_DELAY_MS = 15000; // laisse les écritures en rafale se terminer
let autoSyncTimer = null;

function scheduleAutoSync() {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(runAutoSync, AUTO_SYNC_DELAY_MS);
}

function runAutoSync() {
  autoSyncTimer = null;
  const svc = globalThis.driveSyncService;
  if (!svc || !svc.isAvailable()) return;
  // interactive:false → jeton en cache uniquement, jamais de popup.
  svc.sync(false).then((stats) => {
    console.log('[driveSync auto] ok', stats);
  }).catch((e) => {
    const msg = (e && e.message) || '';
    if (/no-token|already-running/.test(msg)) return; // pas encore autorisé / déjà en cours : silence
    console.error('[driveSync auto] échec :', msg);
  });
}

// Toute écriture dans le stockage local touchant le répertoire déclenche
// (avec temporisation) une synchro. Les écritures de la synchro elle-même
// tombent pendant svc._syncing → filtrées ci-dessous.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const svc = globalThis.driveSyncService;
  if (svc && svc._syncing) return; // nos propres écritures de fusion
  if (Object.keys(changes).some((k) => k.startsWith('song:'))) scheduleAutoSync();
});

// Au démarrage de Chrome : rattraper ce qui a pu changer ailleurs.
chrome.runtime.onStartup.addListener(scheduleAutoSync);

/**
 * Hub de messages. Conventions :
 *  - { type: 'rockstar:open-panel' }        → ouvrir le panneau (depuis un bouton de page)
 *  - { type: 'rockstar:panel-to-tab', payload } → panneau → onglet actif (action sur la page)
 *  - { type: 'rockstar:tab-to-panel', payload } → onglet → panneau (état / données)
 *  - { type: 'rockstar:tab-event', payload }    → broadcast reçu par le panneau
 */
/**
 * Hub de messages. Conventions :
 *  - { type: 'rockstar:open-panel', kind?, tab? } → ouvrir/toggle le panneau
 *  - { type: 'rockstar:panel-to-tab', payload } → panneau → onglet actif (action sur la page)
 *  - { type: 'rockstar:tab-to-panel', payload } → onglet → panneau (état / données)
 *  - { type: 'rockstar:tab-event', payload }    → broadcast reçu par le panneau
 *
 * Le panneau déclare un port (rockstar-panel) à l'ouverture : le service
 * worker sait ainsi, par onglet, si le panneau est ouvert (toggle) et peut
 * lui envoyer des ordres (fermeture, changement d'onglet).
 */
const panelPorts = new Map(); // tabId → port du panneau
const portTabIds = new Map(); // port → tabId (pour relayer la largeur du panneau)

// La largeur du side panel n'est pas mesurable depuis la page (le panneau
// recouvre le contenu sans redimensionner le viewport) : le panneau se
// mesure lui-même et relaie sa largeur, que l'on broadcast aux onglets de
// la fenêtre. Les widgets de page (ex. pill flottant) se repositionnent
// alors pour ne pas passer sous le panneau.
function broadcastPanelWidth(windowId, width) {
  chrome.tabs.query({ windowId }, (tabs) => {
    (tabs || []).forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'rockstar:panel-width', width }, () => {
        void chrome.runtime.lastError; // onglet sans content script : ignorer
      });
    });
  });
}

function handlePanelWidthFromPort(port, width) {
  const tabId = portTabIds.get(port);
  if (tabId == null) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    broadcastPanelWidth(tab.windowId, width);
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'rockstar-panel' && !port.name.startsWith('rockstar-panel:')) return;
  // Le side panel est un document d'extension : sender.tab est null. Le
  // panneau annonce l'onglet auquel il est attaché via le nom du port
  // (« rockstar-panel:<tabId> ») ; fallback sur sender.tab quand il existe.
  let tabId = port.sender && port.sender.tab ? port.sender.tab.id : null;
  if (tabId == null && port.name.startsWith('rockstar-panel:')) {
    const parsed = parseInt(port.name.split(':')[1], 10);
    if (!Number.isNaN(parsed)) tabId = parsed;
  }
  if (tabId == null) {
    port.disconnect();
    return;
  }
  panelPorts.set(tabId, port);
  portTabIds.set(port, tabId);
  port.onMessage.addListener((msg) => {
    if (msg && msg.type === 'rockstar:panel-width' && typeof msg.width === 'number') {
      handlePanelWidthFromPort(port, msg.width);
    }
  });
  port.onDisconnect.addListener(() => {
    if (panelPorts.get(tabId) === port) panelPorts.delete(tabId);
    if (portTabIds.get(port) === tabId) {
      // Panneau fermé (ou rechargé) : la zone masquée disparaît.
      portTabIds.delete(port);
      completeOnboardingOnPanelClose();
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return;
        broadcastPanelWidth(tab.windowId, 0);
      });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('rockstar:')) return;

  switch (msg.type) {
    case 'rockstar:open-panel': {
      const tabId = sender.tab ? sender.tab.id : (msg.tabId ?? null);
      if (tabId == null) {
        sendResponse({ ok: false, error: 'no-tab' });
        break;
      }

      // Panneau déjà ouvert pour cet onglet : lui envoyer l'ordre directement.
      if (panelPorts.has(tabId)) {
        const port = panelPorts.get(tabId);
        if (msg.kind === 'open' && msg.tab) {
          port.postMessage({
            type: 'rockstar:show-tab',
            tab: msg.tab,
            addCurrent: msg.addCurrent === true
          });
        } else {
          port.postMessage({ type: 'rockstar:panel-toggle' });
        }
        sendResponse({ ok: true });
        break;
      }

      // Panneau fermé : mémoriser l'onglet demandé (ex. répertoire via 📖)
      // puis ouvrir — le panneau lira la demande à son chargement. sidePanel
      // .open est appelé dans le même cycle que le geste utilisateur.
      if (msg.tab) {
        chrome.storage.local.set({ rockstar_panel_pending_tab: msg.tab }).catch(() => {});
      }
      if (msg.addCurrent === true) {
        // « + » du pill : l'onglet Chanson devra ajouter la page à l'ouverture.
        chrome.storage.local.set({ rockstar_panel_pending_action: 'add-current' }).catch(() => {});
      }
      chrome.sidePanel
        .open({ tabId })
        .catch((e) => console.error('[VoxRoddy BG] sidePanel.open:', e));
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

    case 'rockstar:replay-onboarding': {
      // « Revoir la visite » (panneau) → relance la partie page du tour sur
      // l'onglet indiqué. Content script absent (page interne) : ignorer.
      if (typeof msg.tabId !== 'number') {
        sendResponse({ ok: false, error: 'no-tab' });
        break;
      }
      chrome.tabs.sendMessage(msg.tabId, { type: 'rockstar:replay-onboarding' }, () => {
        void chrome.runtime.lastError;
        sendResponse({ ok: true });
      });
      return true;
    }
  }
});

// Fermeture du panneau pendant la partie « onglets » de la visite : marquer
// le tour comme terminé (choix produit : pas de reprise inattendue) — sauf
// si c'est la fermeture volontaire d'un « Revoir la visite ».
function completeOnboardingOnPanelClose() {
  chrome.storage.local.get(['rockstar_onboarding_panel_tour_active', 'rockstar_onboarding_replaying'], (res) => {
    if (res && res.rockstar_onboarding_replaying) {
      // Replay demandé : le tour de page va reprendre ; ne pas toucher.
      chrome.storage.local.remove('rockstar_onboarding_replaying').catch(() => {});
      return;
    }
    if (!res || !res.rockstar_onboarding_panel_tour_active) return;
    chrome.storage.local.set({
      rockstar_onboarding_completed: true,
      rockstar_onboarding_stage: false,
      rockstar_onboarding_panel_tour_active: false
    }).catch(() => {});
  });
}