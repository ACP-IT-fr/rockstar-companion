// widgets/repertoireDrawer.js
(function() {
  if (!window.RockstarCore) return;

  let drawerBtn = null;
  let drawerContainer = null;
  let currentSong = null;
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
      artist: artist || "Artiste inconnu",
      capo: capo
    };
  }

  function createDrawerUI() {
    if (document.getElementById('rockstar-drawer') || document.getElementById('ug-drawer-btn')) return;

    // Create Floating Button
    drawerBtn = document.createElement('button');
    drawerBtn.id = 'ug-drawer-btn';
    drawerBtn.innerHTML = '🎙️';
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
          <h3 id="drawer-title">Chargement...</h3>
          <input type="text" id="drawer-artist" class="drawer-artist-input" placeholder="Artiste" value="-">
        </div>
        <div class="drawer-header-actions">
          <button id="drawer-magic-btn" title="Extraire automatiquement les clés et transpositions depuis la page">🪄</button>
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
          </div>
        </div>

        <div class="drawer-section">
          <div class="drawer-label-row">
            <label>Notes d'interprétation</label>
            <button class="drawer-dictate-btn" data-target="drawer-notes" title="Dicter les notes">🎤</button>
          </div>
          <textarea id="drawer-notes" placeholder="Notes de structure, ressentis..."></textarea>
        </div>

        <div class="drawer-section">
          <div class="drawer-label-row">
            <label>Astuces de jeu</label>
            <button class="drawer-dictate-btn" data-target="drawer-tips" title="Dicter les astuces">🎤</button>
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

    const artistInput = drawerContainer.querySelector('#drawer-artist');
    const keyInput = drawerContainer.querySelector('#drawer-key');
    const capoInput = drawerContainer.querySelector('#drawer-capo');
    const transInput = drawerContainer.querySelector('#drawer-transpose');
    const notesText = drawerContainer.querySelector('#drawer-notes');
    const tipsText = drawerContainer.querySelector('#drawer-tips');

    function saveDrawerData() {
      if (!currentSong) return;
      if (artistInput) {
        currentSong.artist = artistInput.value.trim() || "Artiste inconnu";
      }
      currentSong.key = keyInput.value.trim();
      currentSong.capo = parseInt(capoInput.value, 10) || 0;
      currentSong.transpose = parseInt(transInput.value, 10) || 0;
      currentSong.notes = notesText.value;
      currentSong.interpretationNotes = notesText.value;
      currentSong.playingTips = tipsText.value;

      if (window.storageService) {
        window.storageService.saveSong(currentSong);
      }
    }

    if (artistInput) {
      artistInput.addEventListener('blur', saveDrawerData);
    }
    keyInput.addEventListener('blur', saveDrawerData);
    capoInput.addEventListener('change', saveDrawerData);
    transInput.addEventListener('change', saveDrawerData);

    let debounceSave = null;
    function debouncedSave() {
      clearTimeout(debounceSave);
      debounceSave = setTimeout(saveDrawerData, 1000);
    }
    notesText.addEventListener('input', debouncedSave);
    tipsText.addEventListener('input', debouncedSave);

    // Magic Wand
    const magicBtn = drawerContainer.querySelector('#drawer-magic-btn');
    if (magicBtn) {
      magicBtn.addEventListener('click', () => {
        const extracted = autoExtractMetadata();
        let updated = false;

        if (extracted.artist) {
          artistInput.value = extracted.artist;
          currentSong.artist = extracted.artist;
          updated = true;
        }
        if (extracted.key) {
          keyInput.value = extracted.key;
          currentSong.key = extracted.key;
          updated = true;
        }
        if (extracted.capo !== undefined && extracted.capo > 0) {
          capoInput.value = extracted.capo;
          currentSong.capo = extracted.capo;
          updated = true;
        }
        if (extracted.transpose !== undefined && extracted.transpose !== 0) {
          transInput.value = extracted.transpose;
          currentSong.transpose = extracted.transpose;
          updated = true;
        }

        if (updated) {
          [artistInput, keyInput, capoInput, transInput].forEach(input => {
            if (!input) return;
            input.style.transition = 'background-color 0.3s';
            input.style.backgroundColor = 'rgba(255, 193, 7, 0.2)';
            setTimeout(() => {
              input.style.backgroundColor = 'transparent';
            }, 800);
          });
          saveDrawerData();
          if (window.RockstarCore.showFeedback) {
            window.RockstarCore.showFeedback("Mises à jour appliquées par la baguette magique !", true);
          }
        } else {
          if (window.RockstarCore.showFeedback) {
            window.RockstarCore.showFeedback("Aucune clé/capo/transposition/artiste trouvée à extraire.", false);
          }
        }
      });
    }

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
    const url = window.location.href;
    if (!window.storageService) return;

    window.storageService.getSong(url).then(song => {
      if (song) {
        currentSong = song;
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
    drawerContainer.querySelector('#drawer-title').innerText = currentSong.title;
    drawerContainer.querySelector('#drawer-artist').value = currentSong.artist;
    drawerContainer.querySelector('#drawer-key').value = currentSong.key || '';
    drawerContainer.querySelector('#drawer-capo').value = currentSong.capo || 0;
    drawerContainer.querySelector('#drawer-transpose').value = currentSong.transpose || 0;
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

      let icon = '🔗';
      if (link.type === 'youtube') icon = '📺';
      if (link.type === 'spotify') icon = '🎵';

      li.innerHTML = `
        <span class="drawer-link-info">
          <span>${icon}</span>
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

  function autoExtractMetadata() {
    let key = "";
    let transpose = 0;
    let capo = 0;
    let artist = "";

    try {
      const storeDiv = document.querySelector('.js-store');
      if (storeDiv) {
        const raw = storeDiv.getAttribute('data-content');
        if (raw) {
          const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
          const data = JSON.parse(decoded);
          const tab = data?.store?.page?.data?.tab;
          if (tab) {
            if (tab.meta && tab.meta.tonality) {
              key = tab.meta.tonality;
            }
            if (tab.meta && tab.meta.capo) {
              capo = tab.meta.capo;
            }
            if (tab.artist_name) {
              artist = tab.artist_name.trim();
            }
          }
        }
      }
    } catch (e) {
      console.warn("Erreur extraction js-store:", e);
    }

    if (!key) {
      const elements = Array.from(document.querySelectorAll('span, div, td'));
      for (const el of elements) {
        const text = el.innerText.trim();
        if (/^(key|tonalité|tonality)\s*:\s*([A-G][#b]?m?)/i.test(text)) {
          const match = text.match(/^(key|tonalité|tonality)\s*:\s*([A-G][#b]?m?)/i);
          key = match[2];
          break;
        }
      }
    }

    const allText = document.body.innerText;

    if (!capo) {
      const capoMatch = allText.match(/capo\s*(?::|at|case|fret)?\s*(\d+)/i) || 
                        allText.match(/capodastre\s*(?::|à|a|case)?\s*(\d+)/i) || 
                        allText.match(/(\d+)(?:nd|rd|th)?\s*fret\s*capo/i);
      if (capoMatch) {
        capo = parseInt(capoMatch[1], 10);
      }
    }

    const transposeMatch = allText.match(/transpose\s*(?::|by|at)?\s*([+-]?\d+)/i) || 
                           allText.match(/transposition\s*(?::|de)?\s*([+-]?\d+)/i);
    if (transposeMatch) {
      transpose = parseInt(transposeMatch[1], 10);
    } else {
      const transButtons = Array.from(document.querySelectorAll('button, span, div'));
      for (const btn of transButtons) {
        const text = btn.innerText.trim();
        if (/...transpose\s*([+-]\d+)/i.test(text)) {
          const match = text.match(/...transpose\s*([+-]\d+)/i);
          transpose = parseInt(match[1], 10);
          break;
        }
        if (btn.classList.contains('transpose-value') || text.includes('transpose')) {
          const val = parseInt(text.replace(/[^0-9+-]/g, ''), 10);
          if (!isNaN(val)) {
            transpose = val;
            break;
          }
        }
      }
    }

    if (!artist) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        const content = ogTitle.content;
        const parts = content.split(' Chords by ');
        if (parts.length === 2) {
          artist = parts[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
        } else {
          const parts2 = content.split(' Tab by ');
          if (parts2.length === 2) {
            artist = parts2[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
          }
        }
      }

      if (!artist) {
        const artistMatch = allText.match(/artiste?\s*:\s*([^\n\r]+)/i) || 
                            allText.match(/artist\s*:\s*([^\n\r]+)/i) ||
                            allText.match(/by\s+([A-Za-z0-9\s\.\&\-\'\’]+)\s+chords/i);
        if (artistMatch) {
          artist = artistMatch[1].trim();
        }
      }
    }

    return { key, capo, transpose, artist };
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
    const url = `https://www.ultimate-guitar.com/user/mytabs?search=${encodeURIComponent(query)}`;
    if (window.RockstarCore.stopListening) {
      window.RockstarCore.stopListening();
    }
    window.location.href = url;
  }

  function performSearch(query, siteKey) {
    const url = `https://www.ultimate-guitar.com/search.php?title=${encodeURIComponent(query)}&page=1&type[0]=300&rating[0]=4&rating[1]=5&order=myweight`;
    if (window.RockstarCore.stopListening) {
      window.RockstarCore.stopListening();
    }
    window.location.href = url;
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
    'cherche playlist ', 'chercher playlist ',
    'trouve dans ma playlist ', 'trouver dans ma playlist ', 'trouve dans mes playlists ', 'trouver dans mes playlists '
  ];
  
  searchPlaylistPrefixes.forEach(prefix => {
    window.RockstarCore.registerCommand({
      name: 'Search Playlist',
      variants: [prefix],
      handler: (cmdText) => {
        const query = cmdText.substring(prefix.length).trim();
        if (query) {
          searchPlaylistUG(query);
          return { success: true, action: `Recherche de playlist pour "${query}"` };
        }
        return { success: false, action: 'Recherche de playlist vide' };
      }
    });
  });

  const searchPrefixes = ['search for ', 'search ', 'cherche ', 'chercher ', 'trouve ', 'trouver ', 'find '];
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
        window.location.href = window.ugSearchResultLinks[num];
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
    if (drawerBtn) bar.appendChild(drawerBtn);
  };

  // Listening state changes cleanup
  window.RockstarCore.onListeningChanged((isListening) => {
    if (!isListening) {
      stopDictation();
    }
  });

  // Init Drawer
  window.RockstarCore.registerInit(() => {
    if (isUG) {
      initializeDrawer();
    } else {
      window.RockstarCore.onSettingsChanged((settings) => {
        const status = settings.allowedDomains[window.RockstarCore.currentDomain];
        if (status === true) {
          initializeDrawer();
        }
      });
    }
  });
})();
