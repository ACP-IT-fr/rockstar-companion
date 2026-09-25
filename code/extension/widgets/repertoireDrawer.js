// widgets/repertoireDrawer.js
(function() {
  if (!window.RockstarCore) return;

  let drawerBtn = null;
  let drawerContainer = null;
  let currentSong = null;

  function normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtube.com')) {
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      } else if (urlObj.hostname.includes('youtu.be')) {
        const videoId = urlObj.pathname.slice(1);
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      }
      return urlObj.origin + urlObj.pathname;
    } catch (e) {
      return url.split('?')[0].split('#')[0];
    }
  }
  let activeDrawerPlaybackLink = null;
  let dictationRecognition = null;
  let activeDictationTarget = null;
  let activeDictationBtn = null;
  let isDrawerInitialized = false;

  const currentDomain = window.RockstarCore.currentDomain;
  const isUG = currentDomain.endsWith('ultimate-guitar.com');

  function extractUGMetadata(titleOverride) {
    // Panneau latéral : pas de DOM de page à analyser — titre fourni par
    // l'onglet actif, capo inconnu (le content script de la page le remplira).
    if (window.RockstarCore.isExtensionPage) {
      return {
        title: (titleOverride || '').replace(/ Chords.*/, '').replace(/ Tab.*/, '').trim() || 'Sans titre',
        artist: '',
        capo: 0
      };
    }

    let title = '';
    let artist = '';
    let capo = 0;

    try {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        const content = ogTitle.content;
        const parts = content.split(' Chords by ');
        if (parts.length === 2) {
          title = parts[0].trim();
          artist = parts[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
        } else {
          const parts2 = content.split(' Tab by ');
          if (parts2.length === 2) {
            title = parts2[0].trim();
            artist = parts2[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
          }
        }
      }

      if (!title) {
        const h1 = document.querySelector('h1');
        if (h1) title = h1.innerText.trim();
      }

      let capoMatch = null;
      // Sélecteurs ciblés d'abord (moins coûteux et moins fragile qu'un scan
      // de tout le body), puis fallback sur le texte complet de la page.
      const capoEl = document.querySelector('[class*="capo" i], [id*="capo" i]');
      if (capoEl) {
        capoMatch = (capoEl.textContent || '').match(/capo\s*:?\s*(\d+)/i);
      }
      if (!capoMatch) {
        const allText = document.body.innerText;
        capoMatch = allText.match(/capo:\s*(\d+)/i) || allText.match(/capodastre:\s*(\d+)/i) || allText.match(/capo\s+(\d+)\w*\s+fret/i);
      }
      if (capoMatch) {
        capo = parseInt(capoMatch[1], 10);
      }
    } catch (e) {
      console.warn('[repertoireDrawer] extraction des métadonnées :', e);
    }

    return {
      title: title || document.title.replace(/ Chords.*/, '').replace(/ Tab.*/, '').trim(),
      artist: artist || "",
      capo: capo
    };
  }

  function setupDrawerEventListeners() {
    if (!drawerContainer) return;
    // Bind-once : les écouteurs sont attachés une seule fois par instance de
    // tiroir. Si le DOM existait déjà (réinjection du content script), on
    // réutilise les nœuds existants sans recréer d'écouteurs (fini le
    // pattern cloneNode-rebind, source de doublons et de régressions).
    if (drawerContainer.dataset.bound === '1') return;
    drawerContainer.dataset.bound = '1';

    const titleInput = drawerContainer.querySelector('#drawer-title-input');
    const artistInput = drawerContainer.querySelector('#drawer-artist');
    const keyInput = drawerContainer.querySelector('#drawer-key');
    const capoInput = drawerContainer.querySelector('#drawer-capo');
    const transInput = drawerContainer.querySelector('#drawer-transpose');
    const speedInput = drawerContainer.querySelector('#drawer-speed');
    const notesText = drawerContainer.querySelector('#drawer-notes');
    const tipsText = drawerContainer.querySelector('#drawer-tips');

    function saveDrawerData() {
      if (!currentSong || !drawerContainer) return;

      if (titleInput) {
        currentSong.title = titleInput.value.trim() || "Sans titre";
      }
      if (artistInput) {
        currentSong.artist = artistInput.value.trim();
      }
      if (keyInput) {
        currentSong.key = keyInput.value.trim();
      }
      if (capoInput) {
        currentSong.capo = parseInt(capoInput.value, 10) || 0;
      }
      if (transInput) {
        currentSong.transpose = parseInt(transInput.value, 10) || 0;
      }
      if (speedInput) {
        currentSong.scrollSpeed = parseInt(speedInput.value, 10) || 1;
        if (window.RockstarCore) {
          window.RockstarCore.scrollSpeed = currentSong.scrollSpeed;
        }
      }
      if (notesText) {
        // Champ canonique unique (l'alias historique interpretationNotes est
        // converti à la migration, on n'écrit plus jamais deux champs).
        currentSong.notes = notesText.value;
      }
      if (tipsText) {
        currentSong.playingTips = tipsText.value;
      }

      if (window.storageService) {
        window.storageService.saveSong(currentSong);
      }
    }

    if (titleInput) titleInput.addEventListener('blur', saveDrawerData);
    if (artistInput) artistInput.addEventListener('blur', saveDrawerData);
    if (keyInput) keyInput.addEventListener('blur', saveDrawerData);
    if (capoInput) capoInput.addEventListener('change', saveDrawerData);
    if (transInput) transInput.addEventListener('change', saveDrawerData);
    if (speedInput) speedInput.addEventListener('change', saveDrawerData);

    let debounceSave = null;
    function debouncedSave() {
      clearTimeout(debounceSave);
      debounceSave = setTimeout(saveDrawerData, 1000);
    }
    if (notesText) notesText.addEventListener('input', debouncedSave);
    if (tipsText) tipsText.addEventListener('input', debouncedSave);

    // Dictation
    const dictationButtons = drawerContainer.querySelectorAll('.drawer-dictate-btn');
    const DictationSpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!DictationSpeechClass) {
      dictationButtons.forEach(btn => btn.style.display = 'none');
    } else {
      dictationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          toggleDictation(targetId, btn);
        });
      });
    }

    // Link Addition
    const addLinkBtn = drawerContainer.querySelector('#drawer-add-link-btn');
    const linkForm = drawerContainer.querySelector('#drawer-link-form');
    const linkTitle = drawerContainer.querySelector('#drawer-new-link-title');
    const linkUrl = drawerContainer.querySelector('#drawer-new-link-url');
    const linkType = drawerContainer.querySelector('#drawer-new-link-type');
    const saveLinkBtn = drawerContainer.querySelector('#drawer-save-link-btn');
    const cancelLinkBtn = drawerContainer.querySelector('#drawer-cancel-link-btn');

    if (addLinkBtn && linkForm && saveLinkBtn && cancelLinkBtn) {
      addLinkBtn.addEventListener('click', () => {
        linkForm.style.display = linkForm.style.display === 'none' ? 'block' : 'none';
        linkTitle.value = '';
        linkUrl.value = '';
        linkType.value = 'youtube';
      });

      linkUrl.addEventListener('input', () => {
        const val = linkUrl.value.toLowerCase().trim();
        if (val.includes('youtube.com') || val.includes('youtu.be')) {
          linkType.value = 'youtube';
        } else if (val.includes('spotify.com') || val.startsWith('spotify:')) {
          linkType.value = 'spotify';
        } else {
          linkType.value = 'other';
        }
      });

      cancelLinkBtn.addEventListener('click', () => {
        linkForm.style.display = 'none';
      });

      saveLinkBtn.addEventListener('click', () => {
        const url = linkUrl.value.trim();
        const title = linkTitle.value.trim();
        const type = linkType.value;

        if (!url) return;
        if (!currentSong.links) currentSong.links = [];

        currentSong.links.push({
          title: title || (type === 'youtube' ? 'Vidéo YouTube' : 'Audio Spotify'),
          url: url,
          type: type
        });

        if (window.storageService) {
          window.storageService.saveSong(currentSong).then(() => {
            linkForm.style.display = 'none';
            renderDrawerLinks();
          });
        }
      });
    }
  }

  function createDrawerUI() {
    const existingBtn = document.getElementById('ug-drawer-btn');
    const existingDrawer = document.getElementById('rockstar-drawer');

    if (existingBtn && existingDrawer) {
      // Réinjection du content script : réutiliser le tiroir existant tel quel.
      // Les écouteurs sont déjà attachés (bind-once, cf. dataset.bound).
      drawerBtn = existingBtn;
      drawerContainer = existingDrawer;

      setupDrawerEventListeners();
      return;
    }

    if (document.getElementById('rockstar-drawer') || document.getElementById('ug-drawer-btn')) return;

    // Create Floating Button (uniquement en page web : dans le panneau, le
    // tiroir vit dans sa carte et est toujours visible — pas de bouton).
    if (!window.RockstarCore.isExtensionPage) {
      drawerBtn = document.createElement('button');
      drawerBtn.id = 'ug-drawer-btn';
      drawerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="floating-btn-svg"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      drawerBtn.title = 'Ouvrir Vox Roddy (Notes & Playbacks)';

      if (window.RockstarCore.appendButtonsToFloatingBar) {
        window.RockstarCore.appendButtonsToFloatingBar();
      }
    }

    // Create Drawer Container
    drawerContainer = document.createElement('div');
    drawerContainer.id = 'rockstar-drawer';
    drawerContainer.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-header-title">
          <input type="text" id="drawer-title-input" class="drawer-title-input" placeholder="Titre">
          <div class="drawer-artist-row">
            <span class="drawer-artist-label">Artiste :</span>
            <input type="text" id="drawer-artist" class="drawer-artist-input" placeholder="Artiste">
          </div>
        </div>
        <div class="drawer-header-actions">
          <button id="drawer-close-btn">&times;</button>
        </div>
      </div>

      <div class="drawer-body">
        <div id="drawer-tab-status" class="drawer-tab-status" hidden></div>
        <div class="drawer-section">
          <div class="drawer-grid">
            <div class="drawer-input-group">
              <label>Clé / Tonalité</label>
              <input type="text" id="drawer-key" placeholder="Ex: Gm">
            </div>
            <div class="drawer-input-group">
              <label>Capo</label>
              <input type="number" id="drawer-capo" min="0" max="24" value="0">
            </div>
            <div class="drawer-input-group">
              <label>Trans</label>
              <input type="number" id="drawer-transpose" min="-12" max="12" value="0">
            </div>
            <div class="drawer-input-group">
              <label>Vitesse</label>
              <input type="number" id="drawer-speed" min="1" max="10" value="1">
            </div>
          </div>
        </div>

        <div class="drawer-section">
          <div class="drawer-label-row">
            <label>Notes d'interprétation</label>
            <button class="drawer-dictate-btn" data-target="drawer-notes" title="Dicter les notes" style="display: flex; align-items: center; justify-content: center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="dictate-btn-svg"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg></button>
          </div>
          <textarea id="drawer-notes" placeholder="Notes de structure, ressentis..."></textarea>
        </div>

        <div class="drawer-section">
          <div class="drawer-label-row">
            <label>Astuces de jeu</label>
            <button class="drawer-dictate-btn" data-target="drawer-tips" title="Dicter les astuces" style="display: flex; align-items: center; justify-content: center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="dictate-btn-svg"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg></button>
          </div>
          <textarea id="drawer-tips" placeholder="Rythmique, strumming..."></textarea>
        </div>

        <div class="drawer-section flex-col">
          <div class="drawer-section-header">
            <label>Liens de Playback</label>
            <button id="drawer-add-link-btn">+ Ajouter</button>
          </div>

          <div id="drawer-link-form" class="drawer-link-form" style="display: none;">
            <div class="drawer-form-group">
              <label>Nom du lien :</label>
              <input type="text" id="drawer-new-link-title" placeholder="Nom du lien">
            </div>
            <div class="drawer-form-group">
              <label>URL (YouTube / Spotify) :</label>
              <input type="text" id="drawer-new-link-url" placeholder="URL YouTube ou Spotify">
            </div>
            <div class="drawer-form-group">
              <label>Type :</label>
              <select id="drawer-new-link-type">
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div class="drawer-form-buttons">
              <button id="drawer-save-link-btn" class="drawer-btn-ok">Enregistrer</button>
              <button id="drawer-cancel-link-btn" class="drawer-btn-cancel">Annuler</button>
            </div>
          </div>

          <ul id="drawer-links-list"></ul>
          
          <div id="drawer-media-container" class="drawer-media-container">
            <div class="drawer-media-empty">Aucun playback en lecture</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(drawerContainer);

    // Event listeners
    if (drawerBtn) {
      drawerBtn.addEventListener('click', toggleDrawer);
    }
    drawerContainer.querySelector('#drawer-close-btn').addEventListener('click', closeDrawer);

    setupDrawerEventListeners();
  }

  function toggleDrawer() {
    if (drawerContainer && drawerContainer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    if (drawerContainer) {
      drawerContainer.classList.add('open');
      loadSongForDrawer();
    }
  }

  function closeDrawer() {
    if (drawerContainer) {
      drawerContainer.classList.remove('open');
      activeDrawerPlaybackLink = null;
      const mediaContainer = drawerContainer.querySelector('#drawer-media-container');
      if (mediaContainer) {
        mediaContainer.innerHTML = '<div class="drawer-media-empty">Aucun playback en lecture</div>';
      }
    }
  }

  function loadSongForDrawer() {
    // Panneau latéral : travailler sur la chanson de l'onglet actif, pas sur
    // l'URL du panneau lui-même (chrome-extension://...).
    if (window.RockstarCore.isExtensionPage) {
      loadSongFromActiveTab();
      return;
    }
    loadSongForUrl(normalizeUrl(window.location.href), null);
  }

  // Panneau latéral : interroger l'onglet actif (son content script renvoie
  // l'URL et le titre via getState, cf. core.js).
  function loadSongFromActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      setDrawerTabStatus("Pas d'onglet actif disponible.");
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) {
        setDrawerTabStatus('Aucun onglet actif.');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'rockstar:tab-action', payload: { kind: 'getState' } }, (res) => {
        if (chrome.runtime.lastError) void chrome.runtime.lastError;
        let url = null;
        let pageTitle = '';
        if (res && res.ok && res.state && res.state.url) {
          url = res.state.url;
          pageTitle = res.state.title || '';
        } else if (tab.url && !/^(chrome|chrome-extension|edge|about|file):/.test(tab.url)) {
          // Onglet sans content script : l'URL de l'onglet suffit pour lire
          // une fiche existante du répertoire.
          url = tab.url;
          pageTitle = tab.title || '';
        }
        if (!url) {
          setDrawerTabStatus("Ouvre une page avec l'extension (YouTube, ultimate-guitar...) pour éditer sa fiche.");
          return;
        }
        loadSongForUrl(normalizeUrl(url), pageTitle);
      });
    });
  }

  function setDrawerTabStatus(message) {
    if (!drawerContainer) return;
    const el = drawerContainer.querySelector('#drawer-tab-status');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function loadSongForUrl(url, fallbackTitle) {
    if (!window.storageService) return;

    window.storageService.getSong(url).then(song => {
      if (song) {
        currentSong = song;
        notifySongChanged();
        if (song.scrollSpeed !== undefined) {
          window.RockstarCore.scrollSpeed = song.scrollSpeed;
        }
        populateDrawerFields();
        setDrawerTabStatus('');
      } else {
        const metadata = extractUGMetadata(fallbackTitle);
        currentSong = {
          url: url,
          title: metadata.title,
          artist: metadata.artist,
          key: "",
          capo: metadata.capo,
          transpose: 0,
          scrollSpeed: window.RockstarCore ? window.RockstarCore.scrollSpeed : 1,
          notes: "",
          playingTips: "",
          links: []
        };
        notifySongChanged();
        window.storageService.saveSong(currentSong).then(() => {
          populateDrawerFields();
        });
        setDrawerTabStatus('');
      }
    });
  }

  // Informe les autres widgets (bouton flottant) que le morceau courant a changé
  function notifySongChanged() {
    window.dispatchEvent(new CustomEvent('rockstar-song-changed', { detail: { song: currentSong } }));
  }

  function populateDrawerFields() {
    if (!drawerContainer) return;
    drawerContainer.querySelector('#drawer-title-input').value = currentSong.title || '';
    drawerContainer.querySelector('#drawer-artist').value = currentSong.artist || '';
    drawerContainer.querySelector('#drawer-key').value = currentSong.key || '';
    drawerContainer.querySelector('#drawer-capo').value = currentSong.capo || 0;
    drawerContainer.querySelector('#drawer-transpose').value = currentSong.transpose || 0;
    const speedInput = drawerContainer.querySelector('#drawer-speed');
    if (speedInput) {
      speedInput.value = currentSong.scrollSpeed || 1;
    }
    drawerContainer.querySelector('#drawer-notes').value = currentSong.notes || currentSong.interpretationNotes || '';
    drawerContainer.querySelector('#drawer-tips').value = currentSong.playingTips || '';
    
    renderDrawerLinks();
  }

  function renderDrawerLinks() {
    if (!drawerContainer) return;
    const list = drawerContainer.querySelector('#drawer-links-list');
    list.innerHTML = '';

    const links = currentSong.links || [];

    if (!activeDrawerPlaybackLink && links.length > 0) {
      activeDrawerPlaybackLink = links[0];
    }

    if (links.length === 0) {
      const empty = document.createElement('li');
      empty.style.padding = '6px';
      empty.style.fontSize = '11px';
      empty.style.color = '#888';
      empty.style.textAlign = 'center';
      empty.textContent = 'Aucun lien';
      list.appendChild(empty);
      playDrawerPlayback();
      return;
    }

    links.forEach((link, idx) => {
      const li = document.createElement('li');
      li.className = 'drawer-link-item';
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.url === link.url) {
        li.classList.add('active');
      }

      const icon = document.createElement('span');
      icon.style.display = 'flex';
      icon.style.alignItems = 'center';
      icon.innerHTML = buildLinkIcon(link.type); // SVG statique, jamais de donnée utilisateur

      const info = document.createElement('span');
      info.className = 'drawer-link-info';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'drawer-link-title';
      titleSpan.textContent = link.title || 'Lien'; // textContent : pas d'injection
      info.appendChild(icon);
      info.appendChild(titleSpan);
      info.addEventListener('click', () => {
        activeDrawerPlaybackLink = link;
        renderDrawerLinks();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'drawer-link-delete';
      deleteBtn.textContent = '\u00d7';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSong.links.splice(idx, 1);
        window.storageService.saveSong(currentSong).then(() => {
          if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.url === link.url) {
            activeDrawerPlaybackLink = null;
          }
          renderDrawerLinks();
        });
      });

      li.appendChild(info);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });

    playDrawerPlayback();
  }

  function buildLinkIcon(type) {
    const linkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    if (type === 'youtube') {
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-orange);"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><polygon points="10 8 16 11 10 14 10 8"/></svg>';
    } else if (type === 'spotify') {
      return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #1ed760;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }
    return linkSvg;
  }

  function playDrawerPlayback() {
    if (!drawerContainer) return;
    const container = drawerContainer.querySelector('#drawer-media-container');
    container.innerHTML = '';

    if (!activeDrawerPlaybackLink) {
      container.innerHTML = '<div class="drawer-media-empty">Aucun playback en lecture</div>';
      return;
    }

    const { url, type } = activeDrawerPlaybackLink;
    if (type === 'youtube') {
      let videoId = '';
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
          videoId = urlObj.searchParams.get('v');
        } else if (urlObj.hostname.includes('youtu.be')) {
          videoId = urlObj.pathname.slice(1);
        }
      } catch(e) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
          videoId = match[2];
        }
      }

      if (videoId) {
        container.innerHTML = `
          <iframe 
            id="drawer-youtube-iframe"
            src="https://www.youtube.com/embed/${videoId}?enablejsapi=1" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
          </iframe>`;
      } else {
        container.innerHTML = '<div class="drawer-media-empty">Lien YouTube invalide</div>';
      }
    } else if (type === 'spotify') {
      let embedUrl = '';
      if (url.startsWith('spotify:')) {
        const parts = url.split(':');
        if (parts.length >= 3) {
          const t = parts[1];
          const id = parts[2];
          const validTypes = ['track', 'playlist', 'album', 'artist', 'show', 'episode'];
          if (validTypes.includes(t) && id) {
            embedUrl = `https://open.spotify.com/embed/${t}/${id}`;
          }
        }
      } else {
        try {
          const urlObj = new URL(url);
          if (urlObj.hostname.includes('spotify.com')) {
            const paths = urlObj.pathname.split('/').filter(Boolean);
            const validTypes = ['track', 'playlist', 'album', 'artist', 'show', 'episode'];
            const typeIndex = paths.findIndex(segment => validTypes.includes(segment));
            if (typeIndex !== -1 && typeIndex + 1 < paths.length) {
              const t = paths[typeIndex];
              const id = paths[typeIndex + 1];
              embedUrl = `https://open.spotify.com/embed/${t}/${id}`;
            }
          }
        } catch(e) {}
      }

      if (embedUrl) {
        container.innerHTML = `
          <iframe 
            id="drawer-spotify-iframe"
            src="${embedUrl}" 
            allow="encrypted-media"
            style="width: 100%; height: 80px; border: none; border-radius: 8px;">
          </iframe>`;
      } else {
        container.innerHTML = '<div class="drawer-media-empty">Lien Spotify invalide</div>';
      }
    } else {
      container.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'drawer-media-empty';
      // Validation du protocole : javascript: / data: ne doivent jamais
      // devenir des liens cliquables.
      let safeUrl = null;
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') safeUrl = parsed.href;
      } catch (e) {}
      if (safeUrl) {
        const anchor = document.createElement('a');
        anchor.href = safeUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.color = '#d880ff';
        anchor.style.textDecoration = 'underline';
        anchor.textContent = 'Ouvrir le lien externe';
        wrap.appendChild(anchor);
      } else {
        wrap.textContent = 'Lien invalide';
      }
      container.appendChild(wrap);
    }
  }

  function toggleDictation(targetId, button) {
    const textarea = drawerContainer.querySelector(`#${targetId}`);
    if (!textarea) return;

    if (activeDictationTarget === targetId) {
      stopDictation();
      return;
    }

    if (activeDictationTarget) {
      stopDictation();
    }

    activeDictationTarget = targetId;
    activeDictationBtn = button;
    button.classList.add('recording');
    button.title = "En écoute... Cliquez pour arrêter";

    let wasMainListening = window.RockstarCore.isListening;
    if (wasMainListening) {
      window.RockstarCore.stopListening();
    }

    const DictationClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!DictationClass) {
      alert("La dictée vocale n'est pas supportée.");
      stopDictation();
      return;
    }

    dictationRecognition = new DictationClass();
    dictationRecognition.continuous = false;
    dictationRecognition.interimResults = false;
    dictationRecognition.lang = 'fr-FR';

    dictationRecognition.onresult = (event) => {
      const resultText = event.results[0][0].transcript;
      if (resultText) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + (start > 0 && val[start-1] !== ' ' ? ' ' : '') + resultText + (end < val.length && val[end] !== ' ' ? ' ' : '') + val.substring(end);
        textarea.dispatchEvent(new Event('input'));
      }
    };

    dictationRecognition.onend = () => {
      stopDictation();
      if (wasMainListening) {
        window.RockstarCore.startListening(true);
      }
    };

    dictationRecognition.onerror = (e) => {
      console.error("Erreur dictée:", e);
      stopDictation();
      if (wasMainListening) {
        window.RockstarCore.startListening(true);
      }
    };

    dictationRecognition.start();
  }

  function stopDictation() {
    if (dictationRecognition) {
      try {
        dictationRecognition.stop();
      } catch(e) {}
      dictationRecognition = null;
    }
    if (activeDictationBtn) {
      activeDictationBtn.classList.remove('recording');
      activeDictationBtn.title = "Dicter";
    }
    activeDictationTarget = null;
    activeDictationBtn = null;
  }

  function sendYouTubeCommand(func, args = []) {
    if (!drawerContainer) return;
    const iframe = drawerContainer.querySelector('#drawer-youtube-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), 'https://www.youtube.com');
    }
  }

  function searchPlaylistUG(query) {
    const cleaned = query.replace(/\s+(?:on|sur)?\s*(?:ultimate\s*guitar|ug)\s*$/i, '').trim();
    const url = `https://www.ultimate-guitar.com/user/mytabs?search=${encodeURIComponent(cleaned)}`;
    if (window.RockstarCore.stopListening) {
      window.RockstarCore.stopListening();
    }
    if (window.RockstarCore.safeStorageSet) {
      window.RockstarCore.safeStorageSet({ rockstar_wake_on_load: true }, () => {
        window.location.href = url;
      });
    } else {
      window.location.href = url;
    }
  }

  function performSearch(query, siteKey) {
    let target = siteKey || 'ultimate-guitar.com';
    let cleaned = query.trim();

    // Suffix regexes
    const ytRegex = /\s+(?:on|sur)?\s*(?:youtube|yt)\s*$/i;
    const googleRegex = /\s+(?:on|sur)?\s*google\s*$/i;
    const ugRegex = /\s+(?:on|sur)?\s*(?:ultimate\s*guitar|ug)\s*$/i;

    if (ytRegex.test(cleaned)) {
      target = 'youtube.com';
      cleaned = cleaned.replace(ytRegex, '').trim();
    } else if (googleRegex.test(cleaned)) {
      target = 'google.com';
      cleaned = cleaned.replace(googleRegex, '').trim();
    } else if (ugRegex.test(cleaned)) {
      target = 'ultimate-guitar.com';
      cleaned = cleaned.replace(ugRegex, '').trim();
    }

    let url = '';
    if (target === 'youtube.com' || target === 'youtube') {
      url = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleaned)}`;
    } else if (target === 'google.com' || target === 'google') {
      url = `https://www.google.com/search?q=${encodeURIComponent(cleaned)}`;
    } else {
      url = `https://www.ultimate-guitar.com/search.php?title=${encodeURIComponent(cleaned)}&page=1&type[0]=300&rating[0]=4&rating[1]=5&order=myweight`;
    }

    if (window.RockstarCore.stopListening) {
      window.RockstarCore.stopListening();
    }
    if (window.RockstarCore.safeStorageSet) {
      window.RockstarCore.safeStorageSet({ rockstar_wake_on_load: true }, () => {
        window.location.href = url;
      });
    } else {
      window.location.href = url;
    }
  }

  function initializeDrawer() {
    if (isDrawerInitialized) return;
    isDrawerInitialized = true;
    createDrawerUI();
    loadSongForDrawer();
  }

  // Register commands on core
  const searchPlaylistPrefixes = [
    'playlist search ', 'search playlist ', 
    'cherche dans ma playlist ', 'chercher dans ma playlist ', 'cherche dans mes playlists ', 'chercher dans mes playlists ',
    'recherche dans ma playlist ', 'rechercher dans ma playlist ', 'recherche dans mes playlists ', 'rechercher dans mes playlists ',
    'cherche playlist ', 'chercher playlist ',
    'recherche playlist ', 'rechercher playlist ',
    'trouve dans ma playlist ', 'trouver dans ma playlist ', 'trouve dans mes playlists ', 'trouver dans mes playlists '
  ];
  
  searchPlaylistPrefixes.forEach(prefix => {
    window.RockstarCore.registerCommand({
      name: 'Search Playlist',
      variants: [prefix],
      handler: (cmdText) => {
        const query = cmdText.substring(prefix.length).trim();
        if (query) {
          const cleaned = query.replace(/\s+(?:on|sur)?\s*(?:ultimate\s*guitar|ug)\s*$/i, '').trim();
          searchPlaylistUG(cleaned);
          return { success: true, action: `Recherche de playlist pour "${cleaned}"` };
        }
        return { success: false, action: 'Recherche de playlist vide' };
      }
    });
  });

  const searchPrefixes = [
    'search for ', 'search ', 
    'cherche ', 'chercher ', 
    'recherche ', 'rechercher ', 
    'trouve ', 'trouver ', 'find '
  ];
  searchPrefixes.forEach(prefix => {
    window.RockstarCore.registerCommand({
      name: 'General Search',
      variants: [prefix],
      handler: (cmdText) => {
        const query = cmdText.substring(prefix.length).trim();
        if (query) {
          performSearch(query, window.RockstarCore.activeSiteKey);
          return { success: true, action: `Recherche de "${query}"` };
        }
        return { success: false, action: 'Recherche vide' };
      }
    });
  });

  const numPattern = "(\\d+|vingt|twenty|dix[- ]neuf|nineteen|dix[- ]huit|eighteen|dix[- ]sept|seventeen|seize|sixteen|quinze|fifteen|quatorze|fourteen|treize|thirteen|douze|twelve|onze|eleven|10|dix|dis|ten|9|neuf|nine|8|huit|oui|eight|7|sept|set|seven|6|six|sis|5|cinq|sync|five|4|quatre|cat|four|for|3|trois|toi|three|tree|2|deux|de|two|to|1|un|in|one)";
  const openNumRegex = new RegExp("^(?:ouvre|open|go to|choisis|prends|lance)?\\s*(?:le\\s+|la\\s+|the\\s+)?(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "$", "i");
  
  window.RockstarCore.registerCommand({
    name: 'Open Search Result Number',
    regex: openNumRegex,
    handler: (cmdText, match) => {
      const textToNum = {
        '20': 20, 'vingt': 20, 'twenty': 20,
        '19': 19, 'dix neuf': 19, 'dix-neuf': 19, 'nineteen': 19,
        '18': 18, 'dix huit': 18, 'dix-huit': 18, 'eighteen': 18,
        '17': 17, 'dix sept': 17, 'dix-sept': 17, 'seventeen': 17,
        '16': 16, 'seize': 16, 'sixteen': 16,
        '15': 15, 'quinze': 15, 'fifteen': 15,
        '14': 14, 'quatorze': 14, 'fourteen': 14,
        '13': 13, 'treize': 13, 'thirteen': 13,
        '12': 12, 'douze': 12, 'twelve': 12,
        '11': 11, 'onze': 11, 'eleven': 11,
        '10': 10, 'dix': 10, 'dis': 10, 'ten': 10,
        '9': 9, 'neuf': 9, 'nine': 9,
        '8': 8, 'huit': 8, 'oui': 8, 'eight': 8,
        '7': 7, 'sept': 7, 'set': 7, 'seven': 7,
        '6': 6, 'six': 6, 'sis': 6,
        '5': 5, 'cinq': 5, 'sync': 5, 'five': 5,
        '4': 4, 'quatre': 4, 'cat': 4, 'four': 4, 'for': 4,
        '3': 3, 'trois': 3, 'toi': 3, 'three': 3, 'tree': 3,
        '2': 2, 'deux': 2, 'de': 2, 'two': 2, 'to': 2,
        '1': 1, 'un': 1, 'in': 1, 'one': 1
      };
      const matchVal = match[1].toLowerCase();
      const num = /^\d+$/.test(matchVal) ? parseInt(matchVal, 10) : textToNum[matchVal];
      if (num && window.ugSearchResultLinks && window.ugSearchResultLinks[num]) {
        if (window.RockstarCore.stopListening) {
          window.RockstarCore.stopListening();
        }
        if (window.RockstarCore.safeStorageSet) {
          window.RockstarCore.safeStorageSet({ rockstar_wake_on_load: true }, () => {
            window.location.href = window.ugSearchResultLinks[num];
          });
        } else {
          window.location.href = window.ugSearchResultLinks[num];
        }
        return { success: true, action: `Ouverture du résultat #${num}` };
      }
      return { success: false, action: `Résultat #${num || match[1]} non trouvé` };
    }
  });

  // Help command mapping
  window.RockstarCore.registerHelpCommand({ label: "🔍 Chercher Playlist", cmd: "cherche dans ma playlist ", env: "tab" });

  // Expose methods on core namespace
  window.RockstarCore.initializeDrawer = initializeDrawer;
  window.RockstarCore.sendYouTubeCommand = sendYouTubeCommand;
  window.RockstarCore.getActiveDrawerPlaybackLink = () => activeDrawerPlaybackLink;
  window.RockstarCore.getCurrentSong = () => currentSong;
  window.RockstarCore.toggleDrawer = toggleDrawer;
  // Mise à jour manuelle (pill flottant) : fusionne, sauvegarde et notifie.
  window.RockstarCore.updateCurrentSong = (patch) => {
    if (!patch || typeof patch !== 'object') return;
    if (!currentSong) {
      currentSong = {
        url: normalizeUrl(window.location.href),
        title: document.title.replace(/ Chords.*/, '').replace(/ Tab.*/, '').trim(),
        artist: '',
        key: '',
        capo: 0,
        transpose: 0,
        scrollSpeed: window.RockstarCore ? window.RockstarCore.scrollSpeed : 1,
        notes: '',
        playingTips: '',
        links: []
      };
    }
    Object.assign(currentSong, patch);
    if (patch.scrollSpeed !== undefined && window.RockstarCore) {
      window.RockstarCore.scrollSpeed = patch.scrollSpeed;
    }
    notifySongChanged();
    if (window.storageService) {
      window.storageService.saveSong(currentSong);
    }
    return currentSong;
  };
  window.RockstarCore.appendRepertoireDrawerBtn = (bar) => {
    // Le bouton répertoire a quitté la barre résumé : il vit dans le pill
    // (mode panneau) et reste accessible via la voix en mode barre.
    const summaryBar = document.getElementById('ug-song-summary-bar');
    if (summaryBar || !bar) return;
    bar.appendChild(drawerBtn);
  };

  // Listening state changes cleanup
  window.RockstarCore.onListeningChanged((isListening) => {
    if (!isListening) {
      stopDictation();
    }
  });

  let isNumberingInitialized = false;
  function initSearchPageNumbering() {
    if (isNumberingInitialized) return;
    const activeConfig = window.RockstarCore.activeConfig;
    if (!activeConfig) return;
    
    isNumberingInitialized = true;

    function numberSearchResults() {
      if (!activeConfig.isSearchPage()) return;

      const tabLinks = activeConfig.getLinks();
      // Pas de polling : si les liens ne sont pas encore là, le
      // MutationObserver relancera le numérotage quand ils apparaîtront.
      if (tabLinks.length === 0) return;

      // Remove existing badges to avoid duplicates on re-render
      document.querySelectorAll('.ug-result-badge').forEach(el => el.remove());

      window.ugSearchResultLinks = {};
      let counter = 1;
      const processedUrls = new Set();

      tabLinks.forEach(link => {
        const url = normalizeUrl(link.href);
        if (!processedUrls.has(url)) {
          processedUrls.add(url);
          window.ugSearchResultLinks[counter] = link.href;

          const badge = document.createElement('span');
          badge.className = 'ug-result-badge';
          badge.innerText = counter;
          badge.style.display = 'inline-block';
          badge.style.backgroundColor = '#f6921e';
          badge.style.color = '#fff';
          badge.style.fontSize = '11px';
          badge.style.fontWeight = 'bold';
          badge.style.padding = '1px 5px';
          badge.style.borderRadius = '3px';
          badge.style.marginRight = '6px';
          badge.style.verticalAlign = 'middle';

          link.insertBefore(badge, link.firstChild);
          counter++;
        }
      });
    }

    // Run immediately
    numberSearchResults();

    // Mutation observer to handle SPA routing / dynamic DOM updates on search pages
    let lastUrl = window.location.href;
    const searchObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      const isSearchPage = activeConfig.isSearchPage();
      
      if (isSearchPage) {
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          numberSearchResults();
        } else {
          // Check if there are unnumbered links in the DOM
          const tabLinks = activeConfig.getLinks();
          const hasUnnumbered = tabLinks.some(link => !link.querySelector('.ug-result-badge'));
          if (hasUnnumbered && tabLinks.length > 0) {
            numberSearchResults();
          }
        }
      } else {
        lastUrl = currentUrl;
      }
    });
    
    searchObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Init Drawer
  window.RockstarCore.registerInit(() => {
    // Dans le side panel, le tiroir est toujours initialisé (onglet Répertoire)
    if (window.RockstarCore.isExtensionPage) {
      initializeDrawer();
      return;
    }
    if (isUG) {
      initializeDrawer();
      initSearchPageNumbering();
    } else {
      window.RockstarCore.onSettingsChanged((settings) => {
        const status = settings.allowedDomains[window.RockstarCore.currentDomain];
        if (status === true) {
          initializeDrawer();
          initSearchPageNumbering();
        }
      });
    }
  });
  // Navigation SPA : pas de setInterval — hooks history (page web) et
  // événements chrome.tabs (panneau latéral).
  function setupUrlWatch() {
    if (window.RockstarCore.isExtensionPage) {
      // Changement d'onglet actif ou navigation dans l'onglet : recharger
      // la fiche correspondante.
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        if (chrome.tabs.onActivated) {
          chrome.tabs.onActivated.addListener(() => {
            if (isDrawerInitialized) loadSongForDrawer();
          });
        }
        if (chrome.tabs.onUpdated) {
          chrome.tabs.onUpdated.addListener((tabId, info) => {
            if ((info.status === 'complete' || info.url) && isDrawerInitialized) {
              loadSongForDrawer();
            }
          });
        }
      }
      return;
    }

    let lastLoadedUrl = normalizeUrl(window.location.href);
    const onUrlChange = () => {
      const currentUrl = normalizeUrl(window.location.href);
      if (currentUrl === lastLoadedUrl) return;
      lastLoadedUrl = currentUrl;
      if (isDrawerInitialized) {
        loadSongForDrawer();
      }
    };
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);
    ['pushState', 'replaceState'].forEach((fn) => {
      const original = history[fn];
      if (typeof original !== 'function') return;
      history[fn] = function() {
        const result = original.apply(this, arguments);
        setTimeout(onUrlChange, 0);
        return result;
      };
    });
  }
  setupUrlWatch();

  // --- Synchronisation entre contextes (onglet <-> panneau) -------------------
  // Chaque contexte garde currentSong en mémoire : sans écoute, une édition
  // dans le panneau n'apparaît pas dans le tiroir de l'onglet, et inversement.
  // chrome.storage.onChanged est la source de vérité commune (layout song:<url>).
  function isUserTypingInDrawer() {
    try {
      return drawerContainer && drawerContainer.contains(document.activeElement) &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    } catch (e) {
      return false;
    }
  }

  function setupStorageSyncListener() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !currentSong || !isDrawerInitialized) return;
      const key = 'song:' + currentSong.url;
      if (!(key in changes) || !changes[key].newValue) return;

      const incoming = changes[key].newValue;
      // Boucle locale : notre propre saveSong a déjà mis à jour currentSong
      // (savedAt identique) — rien à faire.
      if (incoming.savedAt === currentSong.savedAt && incoming.notes === currentSong.notes) return;

      // Autre contexte a modifié la fiche : adopter la nouvelle valeur.
      currentSong = incoming;
      notifySongChanged();
      // Ne pas écraser les champs pendant que l'utilisateur tape dans ce
      // contexte (sinon perte du curseur) : la resaisie déclenchera une
      // sauvegarde qui réalignera le stockage de toute façon.
      if (!isUserTypingInDrawer()) {
        populateDrawerFields();
      }
      if (incoming.scrollSpeed !== undefined && window.RockstarCore) {
        window.RockstarCore.scrollSpeed = incoming.scrollSpeed;
      }
    });
  }
  setupStorageSyncListener();

  // Exposé pour les tests (normalizeUrl est la clé de répartition du stockage)
  window.RockstarCore.normalizeUrl = normalizeUrl;
})();
