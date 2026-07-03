document.addEventListener('DOMContentLoaded', () => {
  let songs = {};
  let currentSongUrl = null;
  let activePlaybackLink = null;

  // DOM Elements
  const songList = document.getElementById('song-list');
  const searchInput = document.getElementById('search-input');
  const filterKey = document.getElementById('filter-key');
  const filterCapo = document.getElementById('filter-capo');
  
  const noSongSelected = document.getElementById('no-song-selected');
  const songDetailContainer = document.getElementById('song-detail-container');
  
  const detailTitleInput = document.getElementById('detail-title-input');
  const detailArtistInput = document.getElementById('detail-artist-input');
  const detailOriginalUrl = document.getElementById('detail-original-url');
  const detailDeleteBtn = document.getElementById('detail-delete-btn');
  
  const editKey = document.getElementById('edit-key');
  const editCapo = document.getElementById('edit-capo');
  const editTranspose = document.getElementById('edit-transpose');
  const editNotes = document.getElementById('edit-notes');
  const editTips = document.getElementById('edit-tips');
  
  const addLinkBtn = document.getElementById('add-link-btn');
  const addLinkForm = document.getElementById('add-link-form');
  const newLinkTitle = document.getElementById('new-link-title');
  const newLinkUrl = document.getElementById('new-link-url');
  const newLinkType = document.getElementById('new-link-type');
  const saveLinkBtn = document.getElementById('save-link-btn');
  const cancelLinkBtn = document.getElementById('cancel-link-btn');
  
  const playbackLinksList = document.getElementById('playback-links-list');
  const mediaEmbedContainer = document.getElementById('media-embed-container');
  
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file-input');


  // Load and Render Songs List
  function loadSongs(selectFirst = false) {
    if (!window.storageService) {
      console.error("storageService non chargé");
      return;
    }

    window.storageService.getAllSongs().then((loadedSongs) => {
      songs = loadedSongs;
      renderSongList();
      populateFilterKeys();
      
      if (selectFirst && Object.keys(songs).length > 0) {
        selectSong(Object.keys(songs)[0]);
      } else if (currentSongUrl && songs[currentSongUrl]) {
        // Garder le morceau actif après rafraîchissement
        selectSong(currentSongUrl);
      } else {
        showEmptyState();
      }
    });
  }

  // Populate Keys filter dropdown based on saved songs keys
  function populateFilterKeys() {
    const keys = new Set();
    Object.values(songs).forEach(s => {
      if (s.key && s.key.trim()) keys.add(s.key.trim());
    });
    
    // Garder la valeur actuelle si possible
    const currentVal = filterKey.value;
    
    filterKey.innerHTML = '<option value="">Toutes les clés</option>';
    Array.from(keys).sort().forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      filterKey.appendChild(opt);
    });
    
    if (Array.from(keys).includes(currentVal)) {
      filterKey.value = currentVal;
    }
  }

  // Render Sidebar List
  function renderSongList() {
    songList.innerHTML = '';
    const query = searchInput.value.toLowerCase().trim();
    const keyFilter = filterKey.value;
    const capoFilter = filterCapo.value;

    const filtered = Object.values(songs).filter(song => {
      // Filtrer par recherche
      const matchSearch = song.title.toLowerCase().includes(query) || 
                          song.artist.toLowerCase().includes(query);
      
      // Filtrer par clé
      const matchKey = !keyFilter || song.key === keyFilter;
      
      // Filtrer par capo
      let matchCapo = true;
      if (capoFilter !== "") {
        if (capoFilter === "8") {
          matchCapo = song.capo >= 8;
        } else {
          matchCapo = song.capo === parseInt(capoFilter, 10);
        }
      }

      return matchSearch && matchKey && matchCapo;
    });

    // Tri par date de création ou ordre alphabétique
    filtered.sort((a, b) => a.title.localeCompare(b.title));

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.style.padding = '20px';
      li.style.color = 'var(--text-secondary)';
      li.style.fontSize = '13px';
      li.style.textAlign = 'center';
      li.textContent = 'Aucun morceau trouvé';
      songList.appendChild(li);
      return;
    }

    filtered.forEach(song => {
      const li = document.createElement('li');
      li.className = `song-item ${song.url === currentSongUrl ? 'active' : ''}`;
      li.dataset.url = song.url;
      
      li.innerHTML = `
        <div class="song-item-title">${escapeHtml(song.title)}</div>
        <div class="song-item-artist">${escapeHtml(song.artist)}</div>
        <div class="song-item-meta">
          ${song.key ? `<span class="badge orange">${escapeHtml(song.key)}</span>` : ''}
          ${song.capo > 0 ? `<span class="badge">Capo ${song.capo}</span>` : ''}
          ${song.transpose !== 0 ? `<span class="badge">Trans ${song.transpose > 0 ? '+' : ''}${song.transpose}</span>` : ''}
        </div>
      `;

      li.addEventListener('click', () => selectSong(song.url));
      songList.appendChild(li);
    });
  }

  // Helper to escape HTML and prevent XSS
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showEmptyState() {
    currentSongUrl = null;
    noSongSelected.style.display = 'flex';
    songDetailContainer.style.display = 'none';
  }

  // Select and Render Song details
  function selectSong(url) {
    const song = songs[url];
    if (!song) {
      showEmptyState();
      return;
    }

    currentSongUrl = url;
    activePlaybackLink = null;
    
    // Activer l'élément visuel dans la barre latérale
    document.querySelectorAll('.song-item').forEach(item => {
      if (item.dataset.url === url) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    noSongSelected.style.display = 'none';
    songDetailContainer.style.display = 'block';

    // Remplir les informations
    detailTitleInput.value = song.title || '';
    detailArtistInput.value = song.artist || '';
    detailOriginalUrl.href = song.url;
    
    // Formulaires d'édition
    editKey.value = song.key || '';
    editCapo.value = song.capo || 0;
    editTranspose.value = song.transpose || 0;
    editNotes.value = song.notes || song.interpretationNotes || '';
    editTips.value = song.playingTips || '';

    // Fermer le formulaire d'ajout rapide de lien
    addLinkForm.style.display = 'none';

    renderPlaybackLinks();
    renderMediaEmbed();
  }

  // Auto-save form inputs
  function saveCurrentSongState() {
    if (!currentSongUrl || !songs[currentSongUrl]) return;
    
    const original = songs[currentSongUrl];
    const updated = {
      ...original,
      title: detailTitleInput.value.trim() || original.title,
      artist: detailArtistInput.value.trim() || original.artist,
      key: editKey.value.trim(),
      capo: parseInt(editCapo.value, 10) || 0,
      transpose: parseInt(editTranspose.value, 10) || 0,
      notes: editNotes.value,
      interpretationNotes: editNotes.value,
      playingTips: editTips.value
    };

    window.storageService.saveSong(updated).then(() => {
      // Mettre à jour l'objet local
      songs[currentSongUrl] = updated;
      // Rafraîchir la barre latérale pour mettre à jour les badges et le titre de la chanson
      renderSongList();
    });
  }

  // Event Listeners for editing fields (Debounced or Auto-save on blur/change)
  detailTitleInput.addEventListener('blur', saveCurrentSongState);
  detailArtistInput.addEventListener('blur', saveCurrentSongState);
  editKey.addEventListener('blur', saveCurrentSongState);
  editCapo.addEventListener('change', saveCurrentSongState);
  editTranspose.addEventListener('change', saveCurrentSongState);
  
  // Calibration buttons for Capo & Transposition (DAW rack-style)
  document.getElementById('capo-dec').addEventListener('click', () => {
    let val = parseInt(editCapo.value, 10) || 0;
    if (val > 0) {
      editCapo.value = val - 1;
      editCapo.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('capo-inc').addEventListener('click', () => {
    let val = parseInt(editCapo.value, 10) || 0;
    if (val < 24) {
      editCapo.value = val + 1;
      editCapo.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('transpose-dec').addEventListener('click', () => {
    let val = parseInt(editTranspose.value, 10) || 0;
    if (val > -12) {
      editTranspose.value = val - 1;
      editTranspose.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('transpose-inc').addEventListener('click', () => {
    let val = parseInt(editTranspose.value, 10) || 0;
    if (val < 12) {
      editTranspose.value = val + 1;
      editTranspose.dispatchEvent(new Event('change'));
    }
  });
  
  let debounceTimeout = null;
  function saveWithDebounce() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(saveCurrentSongState, 1000);
  }
  editNotes.addEventListener('input', saveWithDebounce);
  editTips.addEventListener('input', saveWithDebounce);

  // Links List
  function renderPlaybackLinks() {
    playbackLinksList.innerHTML = '';
    const song = songs[currentSongUrl];
    if (!song) return;

    const links = song.links || [];

    if (links.length === 0) {
      playbackLinksList.innerHTML = '<li style="padding: 10px; color: var(--text-secondary); font-size: 12px; text-align:center;">Aucun lien associé. Cliquez sur "+ Ajouter" pour en associer un.</li>';
      return;
    }

    links.forEach((link, index) => {
      const li = document.createElement('li');
      const isActive = activePlaybackLink && activePlaybackLink.url === link.url;
      li.className = `link-item ${isActive ? 'active' : ''}`;
      
      let linkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      if (link.type === 'youtube') {
        linkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-orange);"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><polygon points="10 8 16 11 10 14 10 8"/></svg>';
      } else if (link.type === 'spotify') {
        linkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #1ed760;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      }

      li.innerHTML = `
        <div class="link-info" title="Lancer le playback">
          <span class="link-icon" style="display: flex; align-items: center;">${linkIcon}</span>
          <span class="link-title">${escapeHtml(link.title || 'Lien de playback')}</span>
        </div>
        <button class="link-delete-btn" data-index="${index}" style="display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
      `;

      // Clic pour lancer l'embed
      li.querySelector('.link-info').addEventListener('click', () => {
        activePlaybackLink = link;
        renderPlaybackLinks(); // Mettre à jour la classe active
        renderMediaEmbed();
      });

      // Clic pour supprimer
      li.querySelector('.link-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLink(index);
      });

      playbackLinksList.appendChild(li);
    });
  }

  // Delete Link
  function deleteLink(index) {
    const song = songs[currentSongUrl];
    if (!song) return;

    const linkToDelete = song.links[index];
    song.links.splice(index, 1);

    window.storageService.saveSong(song).then(() => {
      if (activePlaybackLink && activePlaybackLink.url === linkToDelete.url) {
        activePlaybackLink = null;
      }
      renderPlaybackLinks();
      renderMediaEmbed();
    });
  }

  // Render Multimedia Embed Player based on selected Link
  function renderMediaEmbed() {
    mediaEmbedContainer.innerHTML = '';
    
    if (!activePlaybackLink) {
      mediaEmbedContainer.innerHTML = '<div class="no-playback-selected">Aucun playback en lecture. Sélectionnez un lien ci-dessus pour charger le lecteur.</div>';
      return;
    }

    const { url, type } = activePlaybackLink;

    if (type === 'youtube') {
      const embedUrl = getYouTubeEmbedUrl(url);
      if (embedUrl) {
        mediaEmbedContainer.innerHTML = `
          <iframe 
            src="${embedUrl}" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
          </iframe>`;
      } else {
        mediaEmbedContainer.innerHTML = `<div class="no-playback-selected">
          <p>Lien YouTube non intégrable.</p>
          <a href="${escapeHtml(url)}" target="_blank" class="btn primary-btn mt-20" style="padding: 6px 12px; font-size:11px;">Ouvrir dans un nouvel onglet</a>
        </div>`;
      }
    } else if (type === 'spotify') {
      const embedUrl = getSpotifyEmbedUrl(url);
      if (embedUrl) {
        mediaEmbedContainer.innerHTML = `
          <iframe 
            src="${embedUrl}" 
            allow="encrypted-media"
            style="border-radius: 8px;">
          </iframe>`;
      } else {
        mediaEmbedContainer.innerHTML = `<div class="no-playback-selected">
          <p>Lien Spotify non intégrable.</p>
          <a href="${escapeHtml(url)}" target="_blank" class="btn primary-btn mt-20" style="padding: 6px 12px; font-size:11px;">Ouvrir Spotify</a>
        </div>`;
      }
    } else {
      mediaEmbedContainer.innerHTML = `
        <div class="no-playback-selected">
          <p>Lien externe (non intégrable directement).</p>
          <a href="${escapeHtml(url)}" target="_blank" class="btn primary-btn mt-20" style="padding: 6px 12px; font-size:11px;">Ouvrir le lien</a>
        </div>`;
    }
  }

  // Convert standard YouTube watch/share link into embed URL
  function getYouTubeEmbedUrl(url) {
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
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }

  // Convert Spotify URL/URI into embed URL
  function getSpotifyEmbedUrl(url) {
    if (!url) return null;

    // Support URI format: spotify:track:ID
    if (url.startsWith('spotify:')) {
      const parts = url.split(':');
      if (parts.length >= 3) {
        const type = parts[1];
        const id = parts[2];
        const validTypes = ['track', 'playlist', 'album', 'artist', 'show', 'episode'];
        if (validTypes.includes(type) && id) {
          return `https://open.spotify.com/embed/${type}/${id}`;
        }
      }
    }

    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('spotify.com')) {
        const paths = urlObj.pathname.split('/').filter(Boolean);
        const validTypes = ['track', 'playlist', 'album', 'artist', 'show', 'episode'];
        const typeIndex = paths.findIndex(segment => validTypes.includes(segment));
        if (typeIndex !== -1 && typeIndex + 1 < paths.length) {
          const type = paths[typeIndex];
          const trackId = paths[typeIndex + 1];
          return `https://open.spotify.com/embed/${type}/${trackId}`;
        }
      }
    } catch(e) {}
    return null;
  }

  // Link additions
  addLinkBtn.addEventListener('click', () => {
    addLinkForm.style.display = addLinkForm.style.display === 'none' ? 'block' : 'none';
    newLinkTitle.value = '';
    newLinkUrl.value = '';
    newLinkType.value = 'youtube';
  });

  cancelLinkBtn.addEventListener('click', () => {
    addLinkForm.style.display = 'none';
  });

  saveLinkBtn.addEventListener('click', () => {
    const title = newLinkTitle.value.trim();
    const url = newLinkUrl.value.trim();
    const type = newLinkType.value;
    const song = songs[currentSongUrl];

    if (!url) {
      alert("L'URL du lien est requise.");
      return;
    }

    if (!song) return;

    if (!song.links) song.links = [];
    
    song.links.push({
      title: title || (type === 'youtube' ? 'Vidéo YouTube' : 'Audio Spotify'),
      url: url,
      type: type
    });

    window.storageService.saveSong(song).then(() => {
      addLinkForm.style.display = 'none';
      renderPlaybackLinks();
    });
  });

  // Delete Song
  detailDeleteBtn.addEventListener('click', () => {
    if (!currentSongUrl) return;
    
    const song = songs[currentSongUrl];
    if (confirm(`Êtes-vous sûr de vouloir supprimer "${song.title}" de votre répertoire ?`)) {
      window.storageService.deleteSong(currentSongUrl).then(() => {
        loadSongs(true); // Recharger et sélectionner la première chanson
      });
    }
  });

  // Search & Filter Events
  searchInput.addEventListener('input', renderSongList);
  filterKey.addEventListener('change', renderSongList);
  filterCapo.addEventListener('change', renderSongList);

  // Import / Export Buttons
  exportBtn.addEventListener('click', () => {
    if (!window.exportService) {
      alert("Le service d'exportation n'est pas chargé.");
      return;
    }

    window.exportService.exportData().then((jsonString) => {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repertoire_rockstar_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(err => {
      alert("Erreur lors de l'exportation : " + err);
    });
  });

  importBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const jsonContent = event.target.result;
      
      window.exportService.importData(jsonContent).then(() => {
        alert("Répertoire importé et fusionné avec succès !");
        loadSongs(true);
      }).catch(err => {
        alert("Erreur lors de l'importation : " + err);
      });
    };
    reader.readAsText(file);
  });

  // Auto-detect link type based on URL input
  if (newLinkUrl) {
    newLinkUrl.addEventListener('input', () => {
      const val = newLinkUrl.value.toLowerCase().trim();
      if (val.includes('youtube.com') || val.includes('youtu.be')) {
        newLinkType.value = 'youtube';
      } else if (val.includes('spotify.com') || val.startsWith('spotify:')) {
        newLinkType.value = 'spotify';
      } else {
        newLinkType.value = 'other';
      }
    });
  }

  // Init
  loadSongs(true);
});
