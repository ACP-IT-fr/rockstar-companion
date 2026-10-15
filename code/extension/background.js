/**
 * background.js — Service worker (MV3) : hub de communication.
 *
 * Rôles :
 *  1. Au clic sur l'icône : injecter les widgets dans l'onglet actif
 *     (pill flottante incluse) PUIS ouvrir le side panel.
 *  2. Router les messages entre le side panel et les content scripts.
 *
 * Le side panel (sidepanel.html) ne partage pas le DOM avec la page :
 * toute action sur la page (scroll, contrôles YouTube, extraction d'accords)
 * passe par ce hub via chrome.tabs.sendMessage, et les événements de la page
 * (état de lecture, etc.) reviennent au panneau via chrome.runtime.sendMessage.
 */

// NB : on ne peut PAS utiliser setPanelBehavior({ openPanelOnActionClick: true })
// ici — quand ce comportement est actif, Chrome n'émet PAS action.onClicked,
// donc la pill ne serait jamais injectée. On pilote les deux actions nous-même
// dans le handler ci-dessous (sidePanel.open dans le geste utilisateur).

// Source unique des fichiers à injecter (même liste que popup.js /
// settingsPanel.js). contentFiles.js définit ROCKSTAR_CONTENT_FILES.
importScripts('contentFiles.js');

/**
 * Injecte les widgets dans l'onglet s'ils ne le sont pas déjà.
 * Ne requiert pas de geste : activeTab est accordé par le clic sur l'icône.
 */
function injectWidgetsIntoTab(tabId) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => typeof window.RockstarCore !== 'undefined' && window.RockstarCore.isInitialized === true
    })
    .then((results) => {
      if (results && results[0] && results[0].result === true) return; // déjà actif
      return chrome.scripting
        .insertCSS({ target: { tabId }, files: ['content.css'] })
        .then(() => chrome.scripting.executeScript({
          target: { tabId },
          func: () => { window.__rockstarDynamicInjectionInProgress = true; }
        }))
        .then(() => (globalThis.ROCKSTAR_CONTENT_FILES
          ? globalThis.ROCKSTAR_CONTENT_FILES.js
          : ['storageService.js', 'core.js', 'voiceEngine.js',
             'widgets/floatingBar.js', 'widgets/floatingButton.js', 'widgets/scroll.js',
             'widgets/metronome.js', 'widgets/tuner.js', 'widgets/chordDetector.js',
             'widgets/repertoireDrawer.js', 'widgets/youtubeController.js',
             'widgets/singingTracker.js', 'widgets/pianoKeyboard.js',
             'widgets/midiInput.js', 'widgets/onboarding.js'])
          .reduce(
            (p, file) => p.then(() => chrome.scripting.executeScript({ target: { tabId }, files: [file] })),
            Promise.resolve()
          ))
        .then(() => chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            delete window.__rockstarDynamicInjectionInProgress;
            if (window.RockstarCore && typeof window.RockstarCore.initialize === 'function') {
              window.RockstarCore.initialize();
            }
          }
        }));
    });
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  const openPanel = () => {
    // Dans le cycle du geste utilisateur : si on attend la fin de
    // l'injection (asynchrone), Chrome peut considérer le geste perdu.
    chrome.sidePanel.open({ tabId: tab.id }).catch((e) =>
      console.error('[VoxRoddy BG] sidePanel.open:', e));
  };
  const url = tab.url || '';
  if (!/^https?:\/\//.test(url)) {
    // Page non injectable (chrome://, store, PDF...) : panneau quand même.
    openPanel();
    return;
  }
  openPanel();
  injectWidgetsIntoTab(tab.id).catch((e) =>
    console.error('[VoxRoddy BG] injection widgets:', e));
});

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

// Au démarrage (et à l'install/mise à jour) : s'assurer que les scripts
// dynamiques des domaines « toujours actifs » (settingsPanel → allowedDomains)
// sont bien enregistrés. Chrome peut les perdre (ex. mise à jour de
// l'extension) ; on répare silencieusement au lieu d'attendre un clic.
const DYNAMIC_SCRIPT_PREFIX = 'rockstar-dynamic-';
function ensureDynamicRegistrations() {
  if (!chrome.scripting || !chrome.scripting.getRegisteredContentScripts) return;
  chrome.storage.sync.get('allowedDomains', (res) => {
    const allowed = (res && res.allowedDomains) || {};
    chrome.scripting.getRegisteredContentScripts((registered) => {
      const registeredIds = new Set((registered || []).map((s) => s.id));
      Object.keys(allowed).forEach((domain) => {
        if (!allowed[domain]) return;
        const scriptId = DYNAMIC_SCRIPT_PREFIX + domain.replace(/[^a-z0-9]/gi, '-');
        if (registeredIds.has(scriptId)) return;
        chrome.scripting.registerContentScripts([{
          id: scriptId,
          matches: [`http://${domain}/*`, `https://${domain}/*`],
          js: ['storageService.js', 'core.js', 'voiceEngine.js',
               'widgets/floatingBar.js', 'widgets/floatingButton.js', 'widgets/scroll.js',
               'widgets/metronome.js', 'widgets/tuner.js', 'widgets/chordDetector.js',
               'widgets/repertoireDrawer.js', 'widgets/youtubeController.js',
               'widgets/singingTracker.js', 'widgets/pianoKeyboard.js',
               'widgets/midiInput.js', 'widgets/onboarding.js'],
          css: ['content.css'],
          runAt: 'document_idle'
        }]).catch((e) => console.warn('[Rockstar BG] re-register failed for', domain, e.message));
      });
    });
  });
}
chrome.runtime.onStartup.addListener(ensureDynamicRegistrations);
chrome.runtime.onInstalled.addListener(ensureDynamicRegistrations);

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

// NB : le side panel Chrome partage la fenêtre — il RÉDUIT déjà le viewport
// de la page (window.innerWidth rétrécit). La page peut donc se clamp
// d'elle-même sur innerWidth ; la largeur relaée ici n'est plus nécessaire
// aux widgets (aucun consommateur), on la broadcast pour compat éventuelle.
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

    case 'rockstar:metronome-relay': {
      // Commande vocale métronome émise depuis la page : en mode panneau
      // latéral le widget ne se monte pas dans la page, c'est l'instance du
      // panneau qui doit l'exécuter (sinon métronome fantôme). Panneau fermé :
      // relayed:false → la page garde une exécution locale de secours.
      const relayTabId = sender && sender.tab ? sender.tab.id : null;
      const panelPort = relayTabId != null ? panelPorts.get(relayTabId) : null;
      if (panelPort) {
        panelPort.postMessage({ type: 'rockstar:metronome-relay', text: msg.text });
        sendResponse({ ok: true, relayed: true });
      } else {
        sendResponse({ ok: true, relayed: false });
      }
      break;
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