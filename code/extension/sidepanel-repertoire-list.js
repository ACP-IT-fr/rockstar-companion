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

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'sp-song-open';

        const title = document.createElement('span');
        title.className = 'sp-song-title';
        title.textContent = song.title || 'Sans titre';

        const meta = document.createElement('span');
        meta.className = 'sp-song-meta';
        meta.textContent = [song.artist, song.key ? 'Ton. ' + song.key : '']
          .filter(Boolean).join(' — ') || '—';

        open.appendChild(title);
        open.appendChild(meta);
        open.title = 'Ouvrir la page de ce morceau';
        open.addEventListener('click', () => {
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

        li.appendChild(open);
        li.appendChild(del);
        list.appendChild(li);
      });
    });
  }

  function setup() {
    renderList();

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