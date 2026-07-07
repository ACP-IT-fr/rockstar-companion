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

  function extractUGMetadata() {
    let title = '';
    let artist = '';
    let capo = 0;
    
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
    
    const allText = document.body.innerText;
    const capoMatch = allText.match(/capo:\s*(\d+)/i) || allText.match(/capodastre:\s*(\d+)/i) || allText.match(/capo\s+(\d+)\w*\s+fret/i);
    if (capoMatch) {
      capo = parseInt(capoMatch[1], 10);
    }
    
    return {
      title: title || document.title.replace(/ Chords.*/, '').replace(/ Tab.*/, '').trim(),
      artist: artist || "",
      capo: capo
    };
  }

  function setupDrawerEventListeners() {
    if (!drawerContainer) return;

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
      const currentTitleInput = drawerContainer.querySelector('#drawer-title-input');
      const currentArtistInput = drawerContainer.querySelector('#drawer-artist');
      const currentKeyInput = drawerContainer.querySelector('#drawer-key');
      const currentCapoInput = drawerContainer.querySelector('#drawer-capo');
      const currentTransInput = drawerContainer.querySelector('#drawer-transpose');
      const currentSpeedInput = drawerContainer.querySelector('#drawer-speed');
      const currentNotesText = drawerContainer.querySelector('#drawer-notes');
      const currentTipsText = drawerContainer.querySelector('#drawer-tips');

      if (currentTitleInput) {
        currentSong.title = currentTitleInput.value.trim() || "Sans titre";
      }
      if (currentArtistInput) {
        currentSong.artist = currentArtistInput.value.trim();
      }
      if (currentKeyInput) {
        currentSong.key = currentKeyInput.value.trim();
      }
      if (currentCapoInput) {
        currentSong.capo = parseInt(currentCapoInput.value, 10) || 0;
      }
      if (currentTransInput) {
        currentSong.transpose = parseInt(currentTransInput.value, 10) || 0;
      }
      if (currentSpeedInput) {
        currentSong.scrollSpeed = parseInt(currentSpeedInput.value, 10) || 1;
        if (window.RockstarCore) {
          window.RockstarCore.scrollSpeed = currentSong.scrollSpeed;
        }
      }
      if (currentNotesText) {
        currentSong.notes = currentNotesText.value;
        currentSong.interpretationNotes = currentNotesText.value;
      }
      if (currentTipsText) {
        currentSong.playingTips = currentTipsText.value;
      }

      if (window.storageService) {
        window.storageService.saveSong(currentSong);
      }
    }

    if (titleInput) {
      const newTitleInput = titleInput.cloneNode(true);
      titleInput.parentNode.replaceChild(newTitleInput, titleInput);
      newTitleInput.addEventListener('blur', saveDrawerData);
    }

    if (artistInput) {
      const newArtistInput = artistInput.cloneNode(true);
      artistInput.parentNode.replaceChild(newArtistInput, artistInput);
      newArtistInput.addEventListener('blur', saveDrawerData);
    }

    const newKeyInput = keyInput.cloneNode(true);
    keyInput.parentNode.replaceChild(newKeyInput, keyInput);
    newKeyInput.addEventListener('blur', saveDrawerData);

    const newCapoInput = capoInput.cloneNode(true);
    capoInput.parentNode.replaceChild(newCapoInput, capoInput);
    newCapoInput.addEventListener('change', saveDrawerData);

    const newTransInput = transInput.cloneNode(true);
    transInput.parentNode.replaceChild(newTransInput, transInput);
    newTransInput.addEventListener('change', saveDrawerData);

    if (speedInput) {
      const newSpeedInput = speedInput.cloneNode(true);
      speedInput.parentNode.replaceChild(newSpeedInput, speedInput);
      newSpeedInput.addEventListener('change', saveDrawerData);
    }

    const newNotesText = notesText.cloneNode(true);
    notesText.parentNode.replaceChild(newNotesText, notesText);

    const newTipsText = tipsText.cloneNode(true);
    tipsText.parentNode.replaceChild(newTipsText, tipsText);

    let debounceSave = null;
    function debouncedSave() {
      clearTimeout(debounceSave);
      debounceSave = setTimeout(saveDrawerData, 1000);
    }
    newNotesText.addEventListener('input', debouncedSave);
    newTipsText.addEventListener('input', debouncedSave);



    // Dictation
    const dictationButtons = drawerContainer.querySelectorAll('.drawer-dictate-btn');
    const DictationSpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!DictationSpeechClass) {
      dictationButtons.forEach(btn => btn.style.display = 'none');
    } else {
      dictationButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
          const targetId = newBtn.getAttribute('data-target');
          toggleDictation(targetId, newBtn);
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
      const newAddLinkBtn = addLinkBtn.cloneNode(true);
      addLinkBtn.parentNode.replaceChild(newAddLinkBtn, addLinkBtn);
      newAddLinkBtn.addEventListener('click', () => {
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

      const newCancelLinkBtn = cancelLinkBtn.cloneNode(true);
      cancelLinkBtn.parentNode.replaceChild(newCancelLinkBtn, cancelLinkBtn);
      newCancelLinkBtn.addEventListener('click', () => {
        linkForm.style.display = 'none';
      });

      const newSaveLinkBtn = saveLinkBtn.cloneNode(true);
      saveLinkBtn.parentNode.replaceChild(newSaveLinkBtn, saveLinkBtn);
      newSaveLinkBtn.addEventListener('click', () => {
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
      drawerBtn = existingBtn;
      drawerContainer = existingDrawer;

      // Re-bind listeners by cloning the buttons
      const newBtn = drawerBtn.cloneNode(true);
      drawerBtn.parentNode.replaceChild(newBtn, drawerBtn);
      drawerBtn = newBtn;
      drawerBtn.addEventListener('click', toggleDrawer);

      const closeBtn = drawerContainer.querySelector('#drawer-close-btn');
      if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', closeDrawer);
      }

      setupDrawerEventListeners();
      return;
    }

    if (document.getElementById('rockstar-drawer') || document.getElementById('ug-drawer-btn')) return;

    // Create Floating Button
    drawerBtn = document.createElement('button');
    drawerBtn.id = 'ug-drawer-btn';
    drawerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="floating-btn-svg"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    drawerBtn.title = 'Ouvrir Vox Roddy (Notes & Playbacks)';
    
    if (window.RockstarCore.appendButtonsToFloatingBar) {
      window.RockstarCore.appendButtonsToFloatingBar();
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
    drawerBtn.addEventListener('click', toggleDrawer);
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
    const url = normalizeUrl(window.location.href);
    if (!window.storageService) return;

    window.storageService.getSong(url).then(song => {
      if (song) {
        currentSong = song;
        if (song.scrollSpeed !== undefined) {
          window.RockstarCore.scrollSpeed = song.scrollSpeed;
        }
        populateDrawerFields();
      } else {
        const metadata = extractUGMetadata();
        currentSong = {
          url: url,
          title: metadata.title,
          artist: metadata.artist,
          key: "",
          capo: metadata.capo,
          transpose: 0,
          scrollSpeed: window.RockstarCore ? window.RockstarCore.scrollSpeed : 1,
          notes: "",
          interpretationNotes: "",
          playingTips: "",
          links: []
        };
        window.storageService.saveSong(currentSong).then(() => {
          populateDrawerFields();
        });
      }
    });
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
      list.innerHTML = '<li style="padding: 6px; font-size:11px; color:#888; text-align:center;">Aucun lien</li>';
      playDrawerPlayback();
      return;
    }

    links.forEach((link, idx) => {
      const li = document.createElement('li');
      li.className = 'drawer-link-item';
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.url === link.url) {
        li.classList.add('active');
      }

      let icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      if (link.type === 'youtube') {
        icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-orange);"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><polygon points="10 8 16 11 10 14 10 8"/></svg>';
      } else if (link.type === 'spotify') {
        icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #1ed760;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      }

      li.innerHTML = `
        <span class="drawer-link-info">
          <span style="display: flex; align-items: center;">${icon}</span>
          <span class="drawer-link-title">${link.title}</span>
        </span>
        <button class="drawer-link-delete" data-index="${idx}">&times;</button>
      `;

      li.querySelector('.drawer-link-info').addEventListener('click', () => {
        activeDrawerPlaybackLink = link;
        renderDrawerLinks();
      });

      li.querySelector('.drawer-link-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        currentSong.links.splice(idx, 1);
        window.storageService.saveSong(currentSong).then(() => {
          if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.url === link.url) {
            activeDrawerPlaybackLink = null;
          }
          renderDrawerLinks();
        });
      });

      list.appendChild(li);
    });

    playDrawerPlayback();
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
      container.innerHTML = `
        <div class="drawer-media-empty">
          <a href="${url}" target="_blank" style="color:#d880ff; text-decoration:underline;">Ouvrir le lien externe</a>
        </div>`;
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
      }), '*');
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

  const numPattern = "(10|dix|dis|ten|9|neuf|nine|8|huit|oui|eight|7|sept|set|seven|6|six|sis|5|cinq|sync|five|4|quatre|cat|four|for|3|trois|toi|three|tree|2|deux|de|two|to|1|un|in|one)";
  const openNumRegex = new RegExp("^(?:ouvre|open|go to|choisis|prends|lance)?\\s*(?:le\\s+|la\\s+|the\\s+)?(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "$", "i");
  
  window.RockstarCore.registerCommand({
    name: 'Open Search Result Number',
    regex: openNumRegex,
    handler: (cmdText, match) => {
      const textToNum = {
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
      const num = textToNum[match[1].toLowerCase()];
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
  window.RockstarCore.appendRepertoireDrawerBtn = (bar) => {
    const summaryBar = document.getElementById('ug-song-summary-bar');
    if (drawerBtn) {
      if (summaryBar) {
        summaryBar.insertBefore(drawerBtn, summaryBar.firstChild);
      } else {
        bar.appendChild(drawerBtn);
      }
    }
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

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (attempts > 30) {
          clearInterval(interval);
          return;
        }

        const tabLinks = activeConfig.getLinks();
        if (tabLinks.length === 0) return;

        clearInterval(interval);

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
      }, 200);
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
  // URL SPA Navigation Observer
  let lastLoadedUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (normalizeUrl(currentUrl) !== normalizeUrl(lastLoadedUrl)) {
      lastLoadedUrl = currentUrl;
      if (isDrawerInitialized) {
        loadSongForDrawer();
      }
    }
  }, 1000);
})();
