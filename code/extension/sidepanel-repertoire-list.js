/**
 * sidepanel-repertoire-list.js — liste des morceaux enregistrés,
 * affichée dans l'onglet Répertoire du panneau (au-dessus de la fiche).
 *
 * Source de données unique : storageService (même stockage que le tiroir
 * et le dashboard). Clic sur un morceau → ouvre sa page ; suppression en
 * deux clics (confirmation inline, sans dialog bloquant).
 */
(function() {
  'use strict';

  let refreshTimer = null;

  function scheduleRefresh() {
    // Plusieurs événements peuvent arriver d'affilée : un seul re-rendu.
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(renderList, 200);
  }

  function renderList() {
    const list = document.getElementById('sp-repertoire-list');
    const empty = document.getElementById('sp-repertoire-empty');
    if (!list || !window.storageService) return;

    window.storageService.getAllSongsList().then((songs) => {
      list.innerHTML = '';
      if (empty) empty.hidden = songs.length > 0;

      songs.forEach((song) => {
        const li = document.createElement('li');
        li.className = 'sp-song-item';

        // Le card lui-même n'est pas cliquable : l'ouverture passe par les
        // deux boutons dédiés (« Ouvrir » / « Nouvel onglet »).
        const info = document.createElement('div');
        info.className = 'sp-song-open';

        const title = document.createElement('span');
        title.className = 'sp-song-title';
        title.textContent = song.title || 'Sans titre';

        const meta = document.createElement('span');
        meta.className = 'sp-song-meta';
        meta.textContent = [song.artist, song.key ? 'Ton. ' + song.key : '']
          .filter(Boolean).join(' — ') || '—';

        info.appendChild(title);
        info.appendChild(meta);

        const openCurrent = document.createElement('button');
        openCurrent.type = 'button';
        openCurrent.className = 'sp-song-btn';
        openCurrent.textContent = 'Ouvrir';
        openCurrent.title = 'Ouvrir la page de ce morceau ici';
        openCurrent.addEventListener('click', () => {
          if (chrome.tabs && chrome.tabs.query && chrome.tabs.update) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const tab = tabs && tabs[0];
              if (tab) chrome.tabs.update(tab.id, { url: song.url, active: true });
            });
          }
        });

        const openNew = document.createElement('button');
        openNew.type = 'button';
        openNew.className = 'sp-song-btn';
        openNew.textContent = 'Nouvel onglet';
        openNew.title = 'Ouvrir la page de ce morceau dans un nouvel onglet';
        openNew.addEventListener('click', () => {
          if (chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: song.url });
          }
        });

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'sp-song-delete';
        del.textContent = '\u00d7';
        del.setAttribute('aria-label', 'Supprimer du répertoire');
        // Confirmation inline en deux clics (pas de confirm() bloquant).
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (del.dataset.confirm === '1') {
            window.storageService.deleteSong(song.url).then(renderList);
          } else {
            del.dataset.confirm = '1';
            del.classList.add('confirm');
            del.textContent = 'Supprimer ?';
            setTimeout(() => {
              del.dataset.confirm = '';
              del.classList.remove('confirm');
              del.textContent = '\u00d7';
            }, 3000);
          }
        });

        li.appendChild(info);
        li.appendChild(openCurrent);
        li.appendChild(openNew);
        li.appendChild(del);
        list.appendChild(li);
      });
    });
  }

  // --- Bouton « + Ajouter cette page » ------------------------------------------
  // L'ajout n'est plus automatique (sinon la liste se remplit de pages sans
  // intérêt) : c'est l'utilisateur qui ajoute explicitement la page affichée.
  function normalizeUrl(url) {
    if (window.RockstarCore && typeof window.RockstarCore.normalizeUrl === 'function') {
      return window.RockstarCore.normalizeUrl(url);
    }
    return url.split('?')[0].split('#')[0];
  }

  function cleanPageTitle(title) {
    return (title || '')
      .replace(/ Chords.*/, '')
      .replace(/ Tab.*/, '')
      .trim() || 'Sans titre';
  }

  function flashAddButton(text, state) {
    const btn = document.getElementById('sp-add-song-btn');
    if (!btn) return;
    btn.dataset.state = state || '';
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => {
      btn.dataset.state = '';
      btn.disabled = false;
      btn.innerHTML = '<span class="sp-add-plus">+</span> Ajouter cette page';
    }, 2200);
  }

  function addCurrentPage() {
    if (!window.storageService || !chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) {
        flashAddButton('Aucun onglet actif', 'exists');
        return;
      }

      // Sans la permission « tabs », tab.url/tab.title sont indéfinis depuis
      // le panneau : demander l'état au content script de la page (même canal
      // que le tiroir, cf. repertoireDrawer.loadSongFromActiveTab).
      chrome.tabs.sendMessage(tab.id, { type: 'rockstar:tab-action', payload: { kind: 'getState' } }, (res) => {
        if (chrome.runtime.lastError) void chrome.runtime.lastError;
        let url = null;
        let pageTitle = '';
        if (res && res.ok && res.state && res.state.url) {
          url = res.state.url;
          pageTitle = res.state.title || '';
        } else if (tab.url && !/^(chrome|chrome-extension|edge|about|file):/.test(tab.url)) {
          // Pas de content script sur cette page : l'URL de l'onglet suffit
          // (disponible uniquement si l'hôte est autorisé / activeTab actif).
          url = tab.url;
          pageTitle = tab.title || '';
        }
        if (!url) {
          flashAddButton('Page non ajoutable', 'exists');
          return;
        }
        url = normalizeUrl(url);

      window.storageService.getSong(url).then((existing) => {
        if (existing) {
          // Déjà enregistrée : signifier plutôt que dupliquer en silence.
          flashAddButton('Déjà dans le répertoire', 'exists');
          return;
        }
        return window.storageService.saveSong({
          url: url,
          title: cleanPageTitle(pageTitle),
          artist: '',
          key: '',
          capo: 0,
          transpose: 0,
          scrollSpeed: 1,
          notes: '',
          playingTips: '',
          links: []
        }).then(() => {
          renderList();
          flashAddButton('Ajouté ✓', 'done');
        });
      }).catch(() => {
        flashAddButton('Ajout impossible', 'exists');
      });
      });
    });
  }

  // --- Indicateur de synchro Drive ----------------------------------------------
  // Le service écrit son état dans le storage ('drive:status') à chaque synchro
  // (manuelle ou automatique) : l'indicateur le lit et le reflète.
  // Cloud neutre au repos, spinner pendant, tick vert 4 s après succès,
  // croix rouge en erreur (le détail humain va dans l'infobulle du bouton).
  const DRIVE_OK_LINGER_MS = 4000;
  let driveOkTimer = null;

  function driveIndicatorEl() {
    return document.getElementById('sp-drive-indicator');
  }

  function humanDriveError(msg) {
    if (/no-client-id|not-configured/.test(msg)) {
      return 'Google Drive n\'est pas encore configuré pour cette extension.';
    }
    if (/no-token/.test(msg)) {
      return 'Connexion à Google requise. Lance une synchro pour autoriser l\'accès.';
    }
    if (/auth-timeout/.test(msg)) {
      return 'Google n\'a pas répondu. Si une fenêtre de connexion Google est restée ouverte derrière cette fenêtre, termine-la, puis réessaie.';
    }
    if (/access_denied|authError|idpiframe|network|Failed to fetch/i.test(msg)) {
      return 'Connexion à Google impossible pour le moment. Réessaie plus tard.';
    }
    return 'La synchronisation n\'a pas abouti. Réessaie dans un instant.';
  }

  function renderDriveStatus(status) {
    const el = driveIndicatorEl();
    if (!el) return;
    const state = (status && status.state) || 'idle';
    const at = (status && status.at) || 0;

    if (driveOkTimer) {
      clearTimeout(driveOkTimer);
      driveOkTimer = null;
    }

    // Un « ok » ancien (ex. panneau rouvert longtemps après) redevient neutre.
    if (state === 'ok' && Date.now() - at > DRIVE_OK_LINGER_MS) {
      setDriveIndicator('idle', 'Synchro avec Google Drive terminée');
      return;
    }

    if (state === 'error') {
      const msg = humanDriveError(status.message || '');
      setDriveIndicator('error', msg);
      return;
    }

    if (state === 'busy') {
      setDriveIndicator('busy', 'Synchronisation…');
      return;
    }

    if (state === 'ok') {
      setDriveIndicator('ok', 'À jour ✓');
      driveOkTimer = setTimeout(() => {
        driveOkTimer = null;
        setDriveIndicator('idle', 'Synchronisation automatique à chaque modification');
      }, DRIVE_OK_LINGER_MS - (Date.now() - at));
      return;
    }

    setDriveIndicator('idle', 'Synchronisation automatique à chaque modification');
  }

  function setDriveIndicator(state, title) {
    const el = driveIndicatorEl();
    if (!el) return;
    el.dataset.state = state;
    el.textContent = state === 'ok' ? '✓' : state === 'error' ? '✕' : state === 'busy' ? '' : '☁';
    const btn = el.closest('button');
    if (btn) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
  }

  function runDriveSync() {
    const svc = window.driveSyncService;
    if (!svc || !window.storageService) return;

    if (!svc.isAvailable()) {
      svc._setStatus('error', 'not-configured');
      return;
    }

    // Le service publie lui-même busy/ok/error dans le storage ; le rendu
    // passe par l'écouteur storage.onChanged. Erreurs déjà traduites là-bas.
    svc.sync(true).catch((e) => {
      if (!/already-running/.test((e && e.message) || '')) {
        console.error('[driveSync]', e);
      }
    });
  }

  function setup() {
    renderList();

    // État de synchro courant (persisté) + suivi en direct.
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('drive:status', (result) => {
        renderDriveStatus(result && result['drive:status']);
      });
    }

    const addBtn = document.getElementById('sp-add-song-btn');
    if (addBtn) {
      addBtn.addEventListener('click', addCurrentPage);
    }

    const driveBtn = document.getElementById('sp-drive-sync-btn');
    if (driveBtn) {
      driveBtn.addEventListener('click', runDriveSync);
    }

    // La liste suit les modifications du répertoire, où qu'elles viennent
    // (fiche du panneau, onglet, dashboard).
    window.addEventListener('rockstar-song-updated', scheduleRefresh);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes['drive:status']) {
          renderDriveStatus(changes['drive:status'].newValue);
        }
        if (Object.keys(changes).some((k) => k.startsWith('song:'))) {
          scheduleRefresh();
        }
      });
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setup();
  } else {
    window.addEventListener('DOMContentLoaded', setup);
  }
})();