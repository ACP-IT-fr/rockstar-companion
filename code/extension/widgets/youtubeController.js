// widgets/youtubeController.js
(function() {
  if (!window.RockstarCore) return;

  let markersWrapper = null;
  let markersBtn = null;
  let markersPanel = null;
  let lastDrawnVideoId = null;
  let lastAccessedBookmarkTime = null;
  let lastAccessedBookmarkName = null;

  function getYTPlayer() {
    return document.querySelector('.html5-video-player') || document.getElementById('movie_player');
  }

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

  function getBookmarksStorageKey() {
    if (window.location.hostname.includes('youtube.com')) {
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');
      if (videoId) {
        return `rockstar_bookmarks_yt_${videoId}`;
      }
    }
    const cleanUrl = window.location.href.split('?')[0].split('#')[0];
    return `rockstar_bookmarks_${cleanUrl}`;
  }

  function normalizeBookmarkName(name) {
    const trimmed = name.trim().toLowerCase();
    if (textToNum[trimmed] !== undefined) {
      return String(textToNum[trimmed]);
    }
    return trimmed;
  }

  function findBookmarkTimeAndName(searchName, bookmarks) {
    const normSearch = normalizeBookmarkName(searchName).trim().toLowerCase();
    const entries = Object.entries(bookmarks);
    entries.sort((a, b) => a[1] - b[1]);

    const isNum = /^\d+$/.test(normSearch);
    if (isNum) {
      const index = parseInt(normSearch, 10) - 1;
      if (index >= 0 && index < entries.length) {
        return { name: entries[index][0], time: entries[index][1] };
      }
    }

    for (const [name, time] of entries) {
      if (normalizeBookmarkName(name).trim().toLowerCase() === normSearch) {
        return { name, time };
      }
    }
    
    if (isNum) {
      for (const [name, time] of entries) {
        const nameNorm = normalizeBookmarkName(name).trim().toLowerCase();
        const numPrefixRegex = new RegExp('^' + normSearch + '(?:\\b|[^0-9])');
        if (numPrefixRegex.test(nameNorm)) {
          return { name, time };
        }
      }
    }
    
    for (const [name, time] of entries) {
      const nameNorm = normalizeBookmarkName(name).trim().toLowerCase();
      if (nameNorm.includes(normSearch)) {
        return { name, time };
      }
    }
    
    return null;
  }

  function getCurrentYouTubeVideoId() {
    if (window.location.hostname.includes('youtube.com')) {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v') || null;
    }
    return null;
  }

  function drawVisualMarkers(force = false) {
    const video = window.RockstarCore.getActiveVideo();
    if (!video || !video.duration) return;

    const progressBar = document.querySelector('.ytp-progress-bar');
    if (!progressBar) return;

    const currentVideoId = getCurrentYouTubeVideoId();
    if (currentVideoId !== lastDrawnVideoId || force) {
      progressBar.querySelectorAll('.rockstar-marker').forEach(m => m.remove());
      lastDrawnVideoId = currentVideoId;
    } else if (progressBar.querySelector('.rockstar-marker')) {
      return;
    }

    const key = getBookmarksStorageKey();
    window.RockstarCore.safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      const entries = Object.entries(bookmarks);
      entries.sort((a, b) => a[1] - b[1]);

      entries.forEach(([name, time], idx) => {
        const pct = (time / video.duration) * 100;
        
        const marker = document.createElement('div');
        marker.className = 'rockstar-marker';
        marker.style.left = `${pct}%`;
        marker.title = `Repère ${idx + 1}: ${name}`;
        
        const markerLine = document.createElement('div');
        markerLine.className = 'rockstar-marker-line';
        marker.appendChild(markerLine);
        
        const markerLabel = document.createElement('div');
        markerLabel.className = 'rockstar-marker-label';
        const isPureNum = /^\d+$/.test(name);
        markerLabel.innerText = isPureNum ? name : `${idx + 1}. ${name}`;
        marker.appendChild(markerLabel);
        
        marker.addEventListener('click', (e) => {
          e.stopPropagation();
          video.currentTime = time;
          lastAccessedBookmarkTime = time;
          lastAccessedBookmarkName = name;
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60).toString().padStart(2, '0');
          if (window.RockstarCore.showFeedback) {
            window.RockstarCore.showFeedback(`➡️ Saut vers Repère "${name}" (${minutes}:${seconds})`, true);
          }
        });
        
        progressBar.appendChild(marker);
      });
    });
  }

  function createMarkersUI() {
    if (document.getElementById('rockstar-markers-panel') || document.getElementById('rockstar-markers-btn')) return;

    markersWrapper = document.createElement('div');
    markersWrapper.className = 'rockstar-markers-wrapper';

    markersBtn = document.createElement('button');
    markersBtn.id = 'rockstar-markers-btn';
    markersBtn.innerText = '📍';
    markersBtn.title = 'Afficher les repères de lecture';
    markersWrapper.appendChild(markersBtn);

    markersPanel = document.createElement('div');
    markersPanel.id = 'rockstar-markers-panel';
    
    markersPanel.innerHTML = `
      <div class="markers-panel-header">
        <span>📍 Repères YouTube</span>
      </div>
      <div class="markers-panel-body">
        <button class="rockstar-add-marker-btn">➕ Poser un repère</button>
        <label class="rockstar-toggle-option">
          <input type="checkbox" id="rockstar-toggle-force-controls" />
          <span>Afficher la barre de navigation</span>
        </label>
        <div class="markers-panel-list"></div>
      </div>
    `;
    markersWrapper.appendChild(markersPanel);

    markersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = markersPanel.classList.toggle('visible');
      if (isVisible) {
        const cmdPanel = document.getElementById('ug-commands-panel');
        if (cmdPanel) cmdPanel.parentElement.classList.remove('active');
        updateMarkersPanelList();
      }
    });

    markersPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('click', () => {
      if (markersPanel) {
        markersPanel.classList.remove('visible');
      }
    });

    const toggleForceControls = markersPanel.querySelector('#rockstar-toggle-force-controls');
    const isForced = localStorage.getItem('rockstar_always_show_controls') === 'true';
    toggleForceControls.checked = isForced;
    
    toggleForceControls.addEventListener('change', () => {
      const active = toggleForceControls.checked;
      localStorage.setItem('rockstar_always_show_controls', active);
      
      const player = document.querySelector('.html5-video-player');
      if (player) {
        player.classList.toggle('rockstar-force-controls-visible', active);
      }
    });

    const addBtn = markersPanel.querySelector('.rockstar-add-marker-btn');
    addBtn.addEventListener('click', () => {
      const video = window.RockstarCore.getActiveVideo();
      if (!video) {
        if (window.RockstarCore.showFeedback) {
          window.RockstarCore.showFeedback("❌ Aucun lecteur vidéo actif", false);
        }
        return;
      }
      const time = video.currentTime;
      const key = getBookmarksStorageKey();
      
      window.RockstarCore.safeStorageGet(key, (res) => {
        const bookmarks = res[key] || {};
        
        let nextNum = Object.keys(bookmarks).length + 1;
        const numericKeys = Object.keys(bookmarks)
          .filter(k => /^\d+$/.test(k))
          .map(k => parseInt(k, 10));
        if (numericKeys.length > 0) {
          nextNum = Math.max(nextNum, Math.max(...numericKeys) + 1);
        }
        const defaultName = String(nextNum);
        
        saveBookmark(defaultName, time, () => {
          updateMarkersPanelList();
        });
      });
    });

    if (window.RockstarCore.appendButtonsToFloatingBar) {
      window.RockstarCore.appendButtonsToFloatingBar();
    }
  }

  function updateMarkersPanelList() {
    if (!markersPanel) return;
    const listContainer = markersPanel.querySelector('.markers-panel-list');
    if (!listContainer) return;

    const key = getBookmarksStorageKey();
    window.RockstarCore.safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      listContainer.innerHTML = '';

      const entries = Object.entries(bookmarks);
      if (entries.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'markers-empty-msg';
        emptyMsg.innerText = 'Aucun repère. Utilisez la voix ou cliquez sur "+" pour en ajouter.';
        listContainer.appendChild(emptyMsg);
        return;
      }

      entries.sort((a, b) => a[1] - b[1]);

      entries.forEach(([name, time], idx) => {
        const item = document.createElement('div');
        item.className = 'rockstar-marker-item';

        const numSpan = document.createElement('span');
        numSpan.className = 'rockstar-marker-num';
        numSpan.innerText = `${idx + 1}.`;
        item.appendChild(numSpan);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'rockstar-marker-name-input';
        nameInput.value = name;
        nameInput.title = 'Cliquez pour renommer';

        const commitRename = () => {
          const newName = nameInput.value.trim();
          if (!newName) {
            nameInput.value = name;
            return;
          }
          if (newName === name) return;

          window.RockstarCore.safeStorageGet(key, (resCurrent) => {
            const currentBookmarks = resCurrent[key] || {};
            const markerTime = currentBookmarks[name];
            delete currentBookmarks[name];
            currentBookmarks[newName] = markerTime !== undefined ? markerTime : time;

            const setObj = { [key]: currentBookmarks };
            window.RockstarCore.safeStorageSet(setObj, () => {
              if (window.RockstarCore.showFeedback) {
                window.RockstarCore.showFeedback(`✏️ Repère renommé en "${newName}"`, true);
              }
              drawVisualMarkers(true);
              updateMarkersPanelList();
            });
          });
        };

        nameInput.addEventListener('blur', commitRename);
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            nameInput.blur();
          }
        });

        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        const timeBtn = document.createElement('button');
        timeBtn.className = 'rockstar-marker-time-btn';
        timeBtn.innerText = `${minutes}:${seconds}`;
        timeBtn.title = 'Aller à ce repère';

        timeBtn.addEventListener('click', () => {
          const video = window.RockstarCore.getActiveVideo();
          if (video) {
            video.currentTime = time;
            lastAccessedBookmarkTime = time;
            lastAccessedBookmarkName = nameInput.value;
            if (window.RockstarCore.showFeedback) {
              window.RockstarCore.showFeedback(`➡️ Saut vers Repère "${nameInput.value}" (${minutes}:${seconds})`, true);
            }
          }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'rockstar-marker-delete-btn';
        deleteBtn.innerText = '🗑️';
        deleteBtn.title = 'Supprimer le repère';

        deleteBtn.addEventListener('click', () => {
          window.RockstarCore.safeStorageGet(key, (resCurrent) => {
            const currentBookmarks = resCurrent[key] || {};
            delete currentBookmarks[name];

            const setObj = { [key]: currentBookmarks };
            window.RockstarCore.safeStorageSet(setObj, () => {
              if (window.RockstarCore.showFeedback) {
                window.RockstarCore.showFeedback(`❌ Repère "${name}" supprimé`, true);
              }
              drawVisualMarkers(true);
              updateMarkersPanelList();
            });
          });
        });

        item.appendChild(nameInput);
        item.appendChild(timeBtn);
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
      });
    });
  }

  function saveBookmark(name, time, callback) {
    const key = getBookmarksStorageKey();
    const normName = normalizeBookmarkName(name);
    
    window.RockstarCore.safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      bookmarks[normName] = time;
      
      const setObj = { [key]: bookmarks };
      window.RockstarCore.safeStorageSet(setObj, () => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        if (window.RockstarCore.showFeedback) {
          window.RockstarCore.showFeedback(`📍 Repère "${name}" enregistré à ${minutes}:${seconds}`, true);
        }
        
        drawVisualMarkers(true);
        updateMarkersPanelList();
        
        if (callback) callback();
      });
    });
  }

  function loadBookmark(name) {
    const key = getBookmarksStorageKey();
    
    window.RockstarCore.safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      const match = findBookmarkTimeAndName(name, bookmarks);
      if (match) {
        const { name: matchedName, time } = match;
        
        lastAccessedBookmarkTime = time;
        lastAccessedBookmarkName = matchedName;
        
        const video = window.RockstarCore.getActiveVideo();
        if (video) {
          video.currentTime = time;
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60).toString().padStart(2, '0');
          if (window.RockstarCore.showFeedback) {
            window.RockstarCore.showFeedback(`➡️ Saut vers Repère "${matchedName}" (${minutes}:${seconds})`, true);
          }
        } else if (window.RockstarCore.sendYouTubeCommand) {
          window.RockstarCore.sendYouTubeCommand('seekTo', [time, true]);
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60).toString().padStart(2, '0');
          if (window.RockstarCore.showFeedback) {
            window.RockstarCore.showFeedback(`➡️ Saut vers Repère "${matchedName}" (${minutes}:${seconds})`, true);
          }
        } else {
          if (window.RockstarCore.showFeedback) {
            window.RockstarCore.showFeedback(`❌ Aucun lecteur vidéo actif`, false);
          }
        }
      }
    });
  }

  // Register commands on core
  const playPlaybackVariants = ['play', 'lecture', 'joue', 'lancer', 'démarrer', 'commence', 'joue la chanson', 'resume', 'start music', 'play song', 'reprends', 'reprendre', 'jouer', 'unpause'];
  const pausePlaybackVariants = ['pause', 'pose', 'stop scroll', 'arrête le scroll', 'arrete le scroll', 'fige', 'bloque', 'suspend', 'stop', 'arrête', 'arrete', 'arrêt', 'arret', 'stoppe', 'stopper', 'stopp', 'pause la musique', 'pause music'];
  
  window.RockstarCore.registerCommand({
    name: 'Play Video',
    variants: playPlaybackVariants,
    handler: () => {
      const ytPlayer = getYTPlayer();
      if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.playVideo();
      } else {
        const video = window.RockstarCore.getActiveVideo();
        if (video) video.play();
      }
      
      const activeDrawerLink = window.RockstarCore.getActiveDrawerPlaybackLink ? window.RockstarCore.getActiveDrawerPlaybackLink() : null;
      if (activeDrawerLink && activeDrawerLink.type === 'youtube' && window.RockstarCore.sendYouTubeCommand) {
        window.RockstarCore.sendYouTubeCommand('playVideo');
      }
      return { success: true, action: 'Lecture vidéo' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Pause Video',
    variants: pausePlaybackVariants,
    handler: () => {
      if (window.RockstarCore.stopScrolling) {
        window.RockstarCore.stopScrolling();
      }
      const ytPlayer = getYTPlayer();
      if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
      } else {
        const video = window.RockstarCore.getActiveVideo();
        if (video) video.pause();
      }

      const activeDrawerLink = window.RockstarCore.getActiveDrawerPlaybackLink ? window.RockstarCore.getActiveDrawerPlaybackLink() : null;
      if (activeDrawerLink && activeDrawerLink.type === 'youtube' && window.RockstarCore.sendYouTubeCommand) {
        window.RockstarCore.sendYouTubeCommand('pauseVideo');
      }
      return { success: true, action: 'Pause vidéo' };
    }
  });

  const rewindRegex = /^(?:recule[s]?|retourne[s]?|rewind|back|arrière|arriere)\s*(?:de\s+)?(\d+|dix|dis|ten|neuf|nine|huit|oui|eight|sept|set|seven|six|sis|cinq|sync|five|quatre|cat|four|for|trois|toi|three|tree|deux|de|two|to|un|in|one)?\s*(?:seconde|secondes|seconds|second)?$/i;
  window.RockstarCore.registerCommand({
    name: 'Rewind Video',
    regex: rewindRegex,
    handler: (cmdText, match) => {
      const rawNum = match[1];
      let seconds = 10;
      if (rawNum) {
        if (textToNum[rawNum.toLowerCase()] !== undefined) {
          seconds = textToNum[rawNum.toLowerCase()];
        } else if (!isNaN(parseInt(rawNum, 10))) {
          seconds = parseInt(rawNum, 10);
        }
      }
      const ytPlayer = getYTPlayer();
      const video = window.RockstarCore.getActiveVideo();
      if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
        const currentTime = ytPlayer.getCurrentTime();
        ytPlayer.seekTo(Math.max(0, currentTime - seconds), true);
        return { success: true, action: `Reculé de ${seconds}s` };
      } else if (video) {
        video.currentTime = Math.max(0, video.currentTime - seconds);
        return { success: true, action: `Reculé de ${seconds}s` };
      } else if (window.RockstarCore.sendYouTubeCommand) {
        window.RockstarCore.sendYouTubeCommand('seekTo', [0, true]);
        return { success: true, action: 'Remis au début (lecteur tiroir)' };
      }
      return { success: false, action: 'Aucun lecteur actif pour reculer' };
    }
  });

  const forwardRegex = /^(?:avance[s]?|forward|skip)\s*(?:de\s+)?(\d+|dix|dis|ten|neuf|nine|huit|oui|eight|sept|set|seven|six|sis|cinq|sync|five|quatre|cat|four|for|trois|toi|three|tree|deux|de|two|to|un|in|one)?\s*(?:seconde|secondes|seconds|second)?$/i;
  window.RockstarCore.registerCommand({
    name: 'Forward Video',
    regex: forwardRegex,
    handler: (cmdText, match) => {
      const rawNum = match[1];
      let seconds = 10;
      if (rawNum) {
        if (textToNum[rawNum.toLowerCase()] !== undefined) {
          seconds = textToNum[rawNum.toLowerCase()];
        } else if (!isNaN(parseInt(rawNum, 10))) {
          seconds = parseInt(rawNum, 10);
        }
      }
      const ytPlayer = getYTPlayer();
      const video = window.RockstarCore.getActiveVideo();
      if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
        const currentTime = ytPlayer.getCurrentTime();
        const duration = ytPlayer.getDuration();
        ytPlayer.seekTo(Math.min(duration || 9999, currentTime + seconds), true);
        return { success: true, action: `Avancé de ${seconds}s` };
      } else if (video) {
        video.currentTime = Math.min(video.duration || 9999, video.currentTime + seconds);
        return { success: true, action: `Avancé de ${seconds}s` };
      }
      return { success: false, action: 'Aucun lecteur actif pour avancer' };
    }
  });

  const restartPlaybackVariants = ['recommence', 'restart', 'recommencer', 'remets au début', 'remets au debut', 'restart song'];
  window.RockstarCore.registerCommand({
    name: 'Restart Video',
    variants: restartPlaybackVariants,
    handler: () => {
      const ytPlayer = getYTPlayer();
      const video = window.RockstarCore.getActiveVideo();
      if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
        ytPlayer.seekTo(0, true);
        if (typeof ytPlayer.playVideo === 'function') {
          ytPlayer.playVideo();
        }
      } else if (video) {
        video.currentTime = 0;
        video.play();
      }
      const activeDrawerLink = window.RockstarCore.getActiveDrawerPlaybackLink ? window.RockstarCore.getActiveDrawerPlaybackLink() : null;
      if (activeDrawerLink && activeDrawerLink.type === 'youtube' && window.RockstarCore.sendYouTubeCommand) {
        window.RockstarCore.sendYouTubeCommand('seekTo', [0, true]);
        window.RockstarCore.sendYouTubeCommand('playVideo');
      }
      return { success: true, action: 'Morceau recommencé' };
    }
  });

  const saveBookmarkRegex = /^(?:enregistre[s]?|place[s]?|placer|sauvegarde[s]?|ajouter|marquer)\s+(?:le\s+)?(?:repère|repere|signet|bookmark)\s+(.+)$/i;
  window.RockstarCore.registerCommand({
    name: 'Save Video Bookmark',
    regex: saveBookmarkRegex,
    handler: (cmdText, match) => {
      const video = window.RockstarCore.getActiveVideo();
      if (video) {
        saveBookmark(match[1], video.currentTime);
        return { success: true, action: `Repère "${match[1]}" posé` };
      }
      return { success: false, action: 'Aucun lecteur actif pour poser un repère' };
    }
  });

  const loadBookmarkRegex = /^(?:va\s+au|retourne[s]?\s+au|reviens[s]?\s+au|charger|go\s+to)?\s*(?:le\s+)?(?:repère|repere|signet|bookmark)\s+(.+)$/i;
  window.RockstarCore.registerCommand({
    name: 'Load Video Bookmark',
    regex: loadBookmarkRegex,
    handler: (cmdText, match) => {
      loadBookmark(match[1]);
      return { success: true, action: `Aller au repère "${match[1]}"` };
    }
  });

  const repeatVariants = ['encore', 'a nouveau', 'à nouveau', 'rejoue', 'rejouer', 'repete', 'répète', 'répéter', 'repeter', 'again', 'repeat', 'once more', 'one more time'];
  window.RockstarCore.registerCommand({
    name: 'Repeat Last Bookmark',
    variants: repeatVariants,
    handler: () => {
      if (lastAccessedBookmarkTime !== null) {
        const ytPlayer = getYTPlayer();
        const video = window.RockstarCore.getActiveVideo();
        if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
          ytPlayer.seekTo(lastAccessedBookmarkTime, true);
          return { success: true, action: `🔄 Encore ! Repère "${lastAccessedBookmarkName || 'Repère'}"` };
        } else if (video) {
          video.currentTime = lastAccessedBookmarkTime;
          return { success: true, action: `🔄 Encore ! Repère "${lastAccessedBookmarkName || 'Repère'}"` };
        } else if (window.RockstarCore.sendYouTubeCommand) {
          window.RockstarCore.sendYouTubeCommand('seekTo', [lastAccessedBookmarkTime, true]);
          return { success: true, action: `🔄 Encore (tiroir) !` };
        }
      }
      return { success: false, action: 'Aucun repère récent à répéter' };
    }
  });

  const videoSpeedRegex = /^(?:vitesse|playback speed|playbackrate)\s*(?:de\s+)?(\d+(?:[.,]\d+)?|normale|normal)$/i;
  window.RockstarCore.registerCommand({
    name: 'Set Video Playback Rate',
    regex: videoSpeedRegex,
    handler: (cmdText, match) => {
      let speedStr = match[1].replace(',', '.');
      let targetRate = 1.0;
      if (speedStr === 'normale' || speedStr === 'normal') {
        targetRate = 1.0;
      } else {
        const parsed = parseFloat(speedStr);
        if (!isNaN(parsed)) {
          targetRate = Math.max(0.25, Math.min(parsed, 4.0));
        }
      }
      const ytPlayer = getYTPlayer();
      const video = window.RockstarCore.getActiveVideo();
      if (video) {
        video.playbackRate = targetRate;
      }
      if (ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
        ytPlayer.setPlaybackRate(targetRate);
      }
      if (window.RockstarCore.sendYouTubeCommand) {
        window.RockstarCore.sendYouTubeCommand('setPlaybackRate', [targetRate]);
      }
      return { success: true, action: `Vitesse de lecture réglée à ${targetRate}x` };
    }
  });

  const speedUpVariants = ['plus vite', 'faster', 'accélère', 'accelere', 'go faster', 'speed up'];
  const slowDownVariants = ['moins vite', 'slower', 'ralentis', 'go slower', 'speed down'];

  window.RockstarCore.registerCommand({
    name: 'Increase Video Speed',
    variants: [],
    regex: new RegExp("vitesse.*(" + speedUpVariants.join('|') + "|augmenter|rapide)", "i"),
    handler: () => {
      const ytPlayer = getYTPlayer();
      const video = window.RockstarCore.getActiveVideo();
      if (ytPlayer && typeof ytPlayer.setPlaybackRate === 'function' && typeof ytPlayer.getPlaybackRate === 'function') {
        const currentRate = ytPlayer.getPlaybackRate();
        const targetRate = Math.min(4.0, currentRate + 0.1);
        ytPlayer.setPlaybackRate(targetRate);
        if (video) video.playbackRate = targetRate;
        return { success: true, action: `Vitesse augmentée à ${targetRate.toFixed(2)}x` };
      } else if (video) {
        video.playbackRate = Math.min(4.0, video.playbackRate + 0.1);
        return { success: true, action: `Vitesse augmentée à ${video.playbackRate.toFixed(2)}x` };
      }
      return { success: false, action: 'Aucun lecteur pour accélérer' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Decrease Video Speed',
    variants: [],
    regex: new RegExp("vitesse.*(" + slowDownVariants.join('|') + "|diminuer|lent)", "i"),
    handler: () => {
      const ytPlayer = getYTPlayer();
      const video = window.RockstarCore.getActiveVideo();
      if (ytPlayer && typeof ytPlayer.setPlaybackRate === 'function' && typeof ytPlayer.getPlaybackRate === 'function') {
        const currentRate = ytPlayer.getPlaybackRate();
        const targetRate = Math.max(0.25, currentRate - 0.1);
        ytPlayer.setPlaybackRate(targetRate);
        if (video) video.playbackRate = targetRate;
        return { success: true, action: `Vitesse diminuée à ${targetRate.toFixed(2)}x` };
      } else if (video) {
        video.playbackRate = Math.max(0.25, video.playbackRate - 0.1);
        return { success: true, action: `Vitesse diminuée à ${video.playbackRate.toFixed(2)}x` };
      }
      return { success: false, action: 'Aucun lecteur pour ralentir' };
    }
  });

  // Help commands for YouTube page
  window.RockstarCore.registerHelpCommand({ label: "▶️ Lecture / Play", cmd: "lecture", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "⏸️ Pause / Stop", cmd: "pause", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "↩️ Reculer 10s", cmd: "recule", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "↪️ Avancer 10s", cmd: "avance", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "🔄 Recommencer", cmd: "recommence", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "⚡ Vitesse 0.75x", cmd: "vitesse 0.75", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "⚡ Vitesse Normale", cmd: "vitesse normale", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "📍 Poser Repère 1", cmd: "enregistre le repère 1", env: "youtube" });
  window.RockstarCore.registerHelpCommand({ label: "➡️ Aller Repère 1", cmd: "retourne au repère 1", env: "youtube" });

  // Init markers / overlays
  window.RockstarCore.registerInit(() => {
    const isYouTube = window.location.hostname.includes('youtube.com');
    if (isYouTube) {
      createMarkersUI();
      
      setInterval(() => {
        const currentVideoId = getCurrentYouTubeVideoId();
        const progressBar = document.querySelector('.ytp-progress-bar');
        const hasIdChanged = currentVideoId !== lastDrawnVideoId;
        if (progressBar && (!progressBar.querySelector('.rockstar-marker') || hasIdChanged)) {
          drawVisualMarkers();
        }
        if (hasIdChanged && markersPanel && markersPanel.classList.contains('visible')) {
          updateMarkersPanelList();
        }

        const isForced = localStorage.getItem('rockstar_always_show_controls') === 'true';
        const player = document.querySelector('.html5-video-player');
        if (player) {
          player.classList.toggle('rockstar-force-controls-visible', isForced);
        }
      }, 2000);
    }
  });

  // Expose key markers methods
  window.RockstarCore.drawVisualMarkers = drawVisualMarkers;
  window.RockstarCore.saveBookmark = saveBookmark;
  window.RockstarCore.loadBookmark = loadBookmark;
  window.RockstarCore.appendMarkersBtn = (bar) => {
    if (markersWrapper) bar.appendChild(markersWrapper);
  };
})();
