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

  // --- Bouton « Drive » ----------------------------------------------------------
  // Une seule action : fusionner le répertoire local et celui de Google Drive.
  // Copy court, sans jargon ; les messages d'erreur restent humains.
  function setDriveStatus(text, kind) {
    const status = document.getElementById('sp-drive-status');
    if (!status) return;
    if (!text) {
      status.hidden = true;
      status.textContent = '';
      return;
    }
    status.hidden = false;
    status.dataset.kind = kind || '';
    status.textContent = text;
  }

  function runDriveSync() {
    const svc = window.driveSyncService;
    if (!svc || !window.storageService) return;

    if (!svc.isAvailable()) {
      setDriveStatus('Google Drive n\'est pas encore configuré pour cette extension.', 'error');
      return;
    }

    setDriveStatus('Synchronisation…', 'busy');
    svc.sync().then((stats) => {
      const parts = [];
      if (stats.added) parts.push(stats.added + ' nouveau' + (stats.added > 1 ? 'x' : '') + ' morceau' + (stats.added > 1 ? 'x' : ''));
      if (stats.updated) parts.push(stats.updated + ' mis à jour');
      if (stats.deleted) parts.push(stats.deleted + ' supprimé' + (stats.deleted > 1 ? 's' : ''));
      setDriveStatus(parts.length ? 'À jour ✓ — ' + parts.join(', ') : 'À jour ✓', 'ok');
      renderList();
      setTimeout(() => setDriveStatus(''), 4000);
    }).catch((e) => {
      const msg = (e && e.message) || '';
      if (/no-client-id/.test(msg)) {
        setDriveStatus('Google Drive n\'est pas encore configuré pour cette extension.', 'error');
      } else if (/already-running/.test(msg)) {
        // Une synchro est déjà en cours : on ne touche pas au message « Synchronisation… ».
        return;
      } else if (/auth-timeout/.test(msg)) {
        setDriveStatus('Google n\'a pas répondu. Si une fenêtre de connexion Google est restée ouverte derrière cette fenêtre, termine-la, puis réessaie.', 'error');
      } else if (/access_denied|authError|idpiframe|network|Failed to fetch/i.test(msg)) {
        setDriveStatus('Connexion à Google impossible pour le moment. Réessaie plus tard.', 'error');
      } else {
        setDriveStatus('La synchronisation n\'a pas abouti. Réessaie dans un instant.', 'error');
      }
      console.error('[driveSync]', e);
    });
  }

  function setup() {
    renderList();

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
        if (area === 'local' && Object.keys(changes).some((k) => k.startsWith('song:'))) {
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