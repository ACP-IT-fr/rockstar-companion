// widgets/floatingBar.js
(function() {
  if (!window.RockstarCore) return;

  let btn = null;
  let iconSpan = null;
  let statusSpan = null;
  let commandsBtn = null;
  let commandsPanel = null;
  let feedbackContainer = null;
  let liveTextContainer = null;
  let songSummaryBar = null;
  let speedContainer = null;
  let bannerEl = null;
  let commandsWrapper = null;
  let settingsBtn = null;
  let settingsPanel = null;
  let helpBtn = null;
  let helpPanel = null;

  function appendButtonsToFloatingBar() {
    const bar = window.RockstarCore.getOrCreateFloatingBar();
    if (commandsWrapper) bar.appendChild(commandsWrapper);
    else if (commandsBtn) bar.appendChild(commandsBtn);
    
    if (window.RockstarCore.appendMarkersBtn) {
      window.RockstarCore.appendMarkersBtn(bar);
    }
    
    if (btn) bar.appendChild(btn);
    
    // Si d'autres modules (comme le repertoireDrawer) enregistrent leurs boutons,
    // ils pourront aussi s'ajouter à la barre flottante. Nous déclenchons un hook.
    if (window.RockstarCore.appendRepertoireDrawerBtn) {
      window.RockstarCore.appendRepertoireDrawerBtn(bar);
    }
    if (window.RockstarCore.appendPianoBtnToFloatingBar) {
      window.RockstarCore.appendPianoBtnToFloatingBar(bar);
    }
  }
  window.RockstarCore.appendButtonsToFloatingBar = appendButtonsToFloatingBar;

  function showFeedback(text, isSuccess) {
    // N'afficher la notification visuelle que pour les échecs / commandes non reconnues
    if (isSuccess) return;

    if (!feedbackContainer) return;

    // Éviter l'empilement : s'il y a déjà une notification d'erreur affichée, on la retire immédiatement
    const existing = feedbackContainer.querySelector('.ug-voice-toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'ug-voice-toast error';
    toast.innerText = text;
    feedbackContainer.appendChild(toast);
    
    // Déclencher l'animation d'entrée par glissement (slide-up)
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  function showActivationBanner() {
    if (document.getElementById('ug-voice-activation-banner') || bannerEl) return;
    
    const currentDomain = window.RockstarCore.currentDomain;

    bannerEl = document.createElement('div');
    bannerEl.id = 'ug-voice-activation-banner';
    bannerEl.innerHTML = `
      <div class="activation-banner-title">🎙️ Guitar Tuner & Metronome <span class="dev-badge">DEV</span></div>
      <div style="font-size: 13px; line-height: 1.4; color: #eee; margin-top: 4px;">Activer le contrôle vocal et l'accordeur sur ce site ?</div>
      <div class="activation-banner-actions" style="margin-top: 8px;">
        <button class="activation-banner-btn secondary" id="banner-btn-refuse">Ne plus demander</button>
        <button class="activation-banner-btn primary" id="banner-btn-accept">Activer</button>
      </div>
    `;
    document.body.appendChild(bannerEl);
    const bar = window.RockstarCore.getOrCreateFloatingBar();
    bar.classList.add('banner-active');
    
    document.getElementById('banner-btn-accept').addEventListener('click', () => {
      window.RockstarCore.safeStorageSyncGet('allowedDomains', (res) => {
        const allowedDomains = res.allowedDomains || {};
        allowedDomains[currentDomain] = true;
        window.RockstarCore.safeStorageSyncSet({ allowedDomains }, () => {
          removeActivationBanner();
          if (window.RockstarCore.initializeDrawer) {
            window.RockstarCore.initializeDrawer();
          }
          if (window.RockstarCore.startListening) {
            window.RockstarCore.startListening(true);
          }
        });
      });
    });
    
    document.getElementById('banner-btn-refuse').addEventListener('click', () => {
      window.RockstarCore.safeStorageSyncGet('allowedDomains', (res) => {
        const allowedDomains = res.allowedDomains || {};
        allowedDomains[currentDomain] = false;
        window.RockstarCore.safeStorageSyncSet({ allowedDomains }, () => {
          removeActivationBanner();
        });
      });
    });
  }

  function removeActivationBanner() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
    const existing = document.getElementById('ug-voice-activation-banner');
    if (existing) existing.remove();
    const bar = window.RockstarCore.getOrCreateFloatingBar();
    bar.classList.remove('banner-active');
  }

  function updateCommandsPanel() {
    const isYouTube = window.location.hostname.includes('youtube.com');
    let title = "Commandes Roddy";
    
    // Obtenir toutes les commandes d'aide enregistrées dynamiquement
    const helpCmds = window.RockstarCore.getHelpCommands();
    let listItems = [];

    if (helpCmds.length > 0) {
      // Filtrer les commandes d'aide selon le domaine (youtube vs tabs)
      const env = isYouTube ? 'youtube' : 'tab';
      listItems = helpCmds.filter(item => item.env === env || !item.env);
    } else {
      // Fallback si aucun module n'a enregistré de commandes d'aide
      if (isYouTube) {
        title = "📹 Commandes YouTube";
        listItems = [
          { label: "▶️ Lecture / Play", cmd: "lecture" },
          { label: "⏸️ Pause / Stop", cmd: "pause" },
          { label: "↩️ Reculer 10s", cmd: "recule" },
          { label: "↪️ Avancer 10s", cmd: "avance" }
        ];
      } else {
        title = "🎸 Commandes Tablature";
        listItems = [
          { label: "⬇️ Défiler vers le bas", cmd: "défile" },
          { label: "⏸️ Pause Scroll", cmd: "pause" }
        ];
      }
    }
    
    commandsPanel.innerHTML = `
      <div class="commands-panel-header">${title}</div>
      <div class="commands-panel-body">
        ${listItems.map(item => `<button class="command-item" data-cmd="${item.cmd}">${item.label}</button>`).join('')}
      </div>
    `;
    
    commandsPanel.querySelectorAll('.command-item').forEach(button => {
      button.addEventListener('click', (e) => {
        const cmdText = button.getAttribute('data-cmd');
        if (cmdText && window.RockstarCore.wakeUp) {
          window.RockstarCore.wakeUp(15000, false);
          window.RockstarCore.handleCommand(cmdText);
        }
      });
    });
  }

  // Enregistrement des hooks et utilitaires sur RockstarCore
  window.RockstarCore.showFeedback = showFeedback;
  window.RockstarCore.showActivationBanner = showActivationBanner;
  window.RockstarCore.removeActivationBanner = removeActivationBanner;
  window.RockstarCore.appendButtonsToFloatingBar = appendButtonsToFloatingBar;

  // Réagir aux changements d'état du moteur de reconnaissance vocale
  window.RockstarCore.onListeningChanged((isListening) => {
    if (btn) {
      btn.classList.toggle('listening', isListening);
      if (!isListening) {
        btn.classList.remove('awake');
        statusSpan.innerText = 'Off';
        btn.title = 'Voice control OFF. Click to enable';
      }
    }
  });

  let awakeProgressAnimFrame = null;
  function updateAwakeProgress() {
    if (!btn) return;
    const awakeUntil = window.RockstarCore.awakeUntil;
    const awakeDuration = window.RockstarCore.awakeDuration;
    
    if (awakeUntil && awakeDuration) {
      const now = Date.now();
      const remaining = awakeUntil - now;
      if (remaining > 0) {
        const pct = Math.max(0, Math.min(100, (remaining / awakeDuration) * 100));
        btn.style.setProperty('--awake-progress', pct + '%');
        awakeProgressAnimFrame = requestAnimationFrame(updateAwakeProgress);
        return;
      }
    }
    btn.style.setProperty('--awake-progress', '0%');
  }

  window.RockstarCore.onAwakeChanged((isAwake) => {
    if (!window.RockstarCore.isListening) return;
    
    if (awakeProgressAnimFrame) {
      cancelAnimationFrame(awakeProgressAnimFrame);
      awakeProgressAnimFrame = null;
    }

    if (btn) {
      btn.classList.toggle('awake', isAwake);
      if (statusSpan) {
        statusSpan.innerText = isAwake ? "À l'écoute" : 'Veille';
      }
      if (isAwake) {
        btn.title = 'Listening... Click to turn off';
        awakeProgressAnimFrame = requestAnimationFrame(updateAwakeProgress);
      } else {
        const settings = window.RockstarCore.settings;
        btn.title = `Listening for "${settings.wakeWord}"... Click to turn off`;
        if (statusSpan) {
          statusSpan.innerText = `Listening (Say ${settings.wakeWord}...)`;
        }
        btn.style.setProperty('--awake-progress', '100%');
      }
    }
  });

  window.RockstarCore.onSettingsChanged((settings) => {
    if (btn && !window.RockstarCore.isAwake && window.RockstarCore.isListening) {
      btn.title = `Listening for "${settings.wakeWord}"... Click to turn off`;
      if (statusSpan) {
        statusSpan.innerText = `Listening (Say ${settings.wakeWord}...)`;
      }
    }
  });

  // Hook d'initialisation de l'UI
  window.RockstarCore.registerInit(() => {
    // 1. Bouton principal du micro
    btn = document.createElement('button');
    btn.id = 'ug-voice-btn';
    
    iconSpan = document.createElement('span');
    iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="floating-btn-svg" style="display: block;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
    
    statusSpan = document.createElement('span');
    statusSpan.id = 'ug-voice-status';
    statusSpan.innerText = 'Off';
    
    btn.appendChild(iconSpan);
    btn.appendChild(statusSpan);
    btn.title = 'Voice control OFF. Click to enable';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.RockstarCore.isListening && !window.RockstarCore.isAwake) {
        if (window.RockstarCore.wakeUp) {
          window.RockstarCore.wakeUp(15000, true);
        }
      } else {
        if (window.RockstarCore.startListening) {
          window.RockstarCore.startListening();
        }
      }
    });

    // 2. Conteneurs de feedback et transcript direct
    feedbackContainer = document.createElement('div');
    feedbackContainer.id = 'ug-voice-feedback';
    document.body.appendChild(feedbackContainer);

    liveTextContainer = document.createElement('div');
    liveTextContainer.id = 'ug-voice-live-text';
    liveTextContainer.innerHTML = `
      <div class="ug-voice-bar-section" id="ug-voice-live-raw">
        <span class="ug-voice-bar-label">Flux Micro:</span>
        <span class="ug-voice-bar-value">Silencieux</span>
      </div>
      <div class="ug-voice-bar-section" id="ug-voice-live-history">
        <span class="ug-voice-bar-label">Commandes:</span>
        <span class="ug-voice-bar-value">(Aucune)</span>
      </div>
      <div class="ug-voice-bar-section" id="ug-voice-live-last">
        <span class="ug-voice-bar-label">Dernière:</span>
        <span class="ug-voice-bar-value">-</span>
      </div>
      <button id="ug-voice-help-btn" title="Aide & Commandes Guitar Tuner & Metronome" style="pointer-events: auto; background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 14px; padding: 0 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.2s; margin-right: 6px;">❓</button>
      <button id="ug-voice-settings-btn" title="Paramètres Guitar Tuner & Metronome" style="pointer-events: auto; background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 14px; padding: 0 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.2s;">⚙️</button>
    `;
    document.body.appendChild(liveTextContainer);

    // 2b. Summary Bar
    songSummaryBar = document.createElement('div');
    songSummaryBar.id = 'ug-song-summary-bar';
    songSummaryBar.innerHTML = `
      <button id="summary-scroll-toggle" class="summary-scroll-toggle" title="Lancer / Arrêter le défilement automatique">
        <svg id="summary-scroll-icon-play" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><polygon points="5,3 19,12 5,21"/></svg>
        <svg id="summary-scroll-icon-stop" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
      <div class="summary-section">
        <span class="summary-label">Clé:</span>
        <span class="summary-value" id="summary-key">-</span>
      </div>
      <div class="summary-section">
        <span class="summary-label">Capo:</span>
        <span class="summary-value" id="summary-capo">-</span>
      </div>
      <div class="summary-section">
        <span class="summary-label">Trans:</span>
        <span class="summary-value" id="summary-transpose">-</span>
      </div>
      <div class="summary-section">
        <span class="summary-label">Vitesse:</span>
        <span class="summary-value" id="summary-speed">1</span>
      </div>
      <div class="summary-section clickable" id="summary-notes-trigger">
        <span class="summary-label">Notes:</span>
        <span class="summary-value" id="summary-notes-text">-</span>
        <div class="summary-dropdown" id="summary-notes-dropdown">
          <div class="summary-dropdown-header">Notes d'interprétation</div>
          <div class="summary-dropdown-content" id="summary-notes-full">Aucune note</div>
        </div>
      </div>
      <div class="summary-section clickable" id="summary-tips-trigger">
        <span class="summary-label">Astuces:</span>
        <span class="summary-value" id="summary-tips-text">-</span>
        <div class="summary-dropdown" id="summary-tips-dropdown">
          <div class="summary-dropdown-header">Astuces de jeu</div>
          <div class="summary-dropdown-content" id="summary-tips-full">Aucune astuce</div>
        </div>
      </div>
    `;
    document.body.appendChild(songSummaryBar);
    if (window.RockstarCore.appendButtonsToFloatingBar) {
      window.RockstarCore.appendButtonsToFloatingBar();
    }

    function normalizeSummaryUrl(url) {
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

    function updateSummaryBar(song) {
      const keyEl = document.getElementById('summary-key');
      const capoEl = document.getElementById('summary-capo');
      const transEl = document.getElementById('summary-transpose');
      const speedEl = document.getElementById('summary-speed');
      const notesTextEl = document.getElementById('summary-notes-text');
      const notesFullEl = document.getElementById('summary-notes-full');
      const tipsTextEl = document.getElementById('summary-tips-text');
      const tipsFullEl = document.getElementById('summary-tips-full');

      if (!song) {
        if (keyEl) keyEl.innerText = '-';
        if (capoEl) capoEl.innerText = '-';
        if (transEl) transEl.innerText = '-';
        if (speedEl) speedEl.innerText = window.RockstarCore.scrollSpeed || '1';
        if (notesTextEl) notesTextEl.innerText = '-';
        if (notesFullEl) notesFullEl.innerText = 'Aucune note';
        if (tipsTextEl) tipsTextEl.innerText = '-';
        if (tipsFullEl) tipsFullEl.innerText = 'Aucune astuce';
        return;
      }

      if (keyEl) keyEl.innerText = song.key || 'N/A';
      if (capoEl) capoEl.innerText = song.capo !== undefined ? song.capo : '0';
      if (transEl) transEl.innerText = song.transpose !== undefined ? (song.transpose > 0 ? '+' + song.transpose : song.transpose) : '0';
      if (speedEl) speedEl.innerText = song.scrollSpeed !== undefined ? song.scrollSpeed : (window.RockstarCore.scrollSpeed || '1');
      
      const notesVal = song.notes || song.interpretationNotes || '';
      if (notesTextEl) {
        notesTextEl.innerText = notesVal ? (notesVal.length > 25 ? notesVal.substring(0, 25) + '...' : notesVal) : '(vide)';
      }
      if (notesFullEl) {
        notesFullEl.innerText = notesVal || 'Aucune note';
      }

      const tipsVal = song.playingTips || '';
      if (tipsTextEl) {
        tipsTextEl.innerText = tipsVal ? (tipsVal.length > 25 ? tipsVal.substring(0, 25) + '...' : tipsVal) : '(vide)';
      }
      if (tipsFullEl) {
        tipsFullEl.innerText = tipsVal || 'Aucune astuce';
      }
    }

    function fetchAndRenderSummary() {
      if (!window.storageService) return;
      const url = normalizeSummaryUrl(window.location.href);
      window.storageService.getSong(url).then(song => {
        updateSummaryBar(song);
      });
    }

    // Load initial song summary
    fetchAndRenderSummary();

    // Listen to updates from saveSong or options/drawer changes
    window.addEventListener('rockstar-song-updated', (e) => {
      const updatedSong = e.detail;
      if (updatedSong && normalizeSummaryUrl(updatedSong.url) === normalizeSummaryUrl(window.location.href)) {
        updateSummaryBar(updatedSong);
      }
    });

    // Also poll/check on URL changes
    let lastSummaryUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastSummaryUrl) {
        lastSummaryUrl = window.location.href;
        fetchAndRenderSummary();
      }
    }, 1000);

    // --- Manual scroll toggle button logic ---
    const scrollToggleBtn = document.getElementById('summary-scroll-toggle');
    const scrollIconPlay = document.getElementById('summary-scroll-icon-play');
    const scrollIconStop = document.getElementById('summary-scroll-icon-stop');

    function updateScrollToggleState(isScrolling) {
      if (!scrollToggleBtn) return;
      if (isScrolling) {
        scrollToggleBtn.classList.add('active');
        scrollToggleBtn.title = 'Arrêter le défilement automatique';
        if (scrollIconPlay) scrollIconPlay.style.display = 'none';
        if (scrollIconStop) scrollIconStop.style.display = 'block';
      } else {
        scrollToggleBtn.classList.remove('active');
        scrollToggleBtn.title = 'Lancer le défilement automatique';
        if (scrollIconPlay) scrollIconPlay.style.display = 'block';
        if (scrollIconStop) scrollIconStop.style.display = 'none';
      }
    }

    if (scrollToggleBtn) {
      scrollToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.RockstarCore.isScrolling) {
          if (window.RockstarCore.stopScrolling) window.RockstarCore.stopScrolling();
        } else {
          if (window.RockstarCore.startScrolling) window.RockstarCore.startScrolling(1);
        }
      });
    }

    // React to scroll state changes dispatched by scroll.js
    window.addEventListener('rockstar-scroll-state-changed', (e) => {
      updateScrollToggleState(e.detail && e.detail.isScrolling);
    });

    // React to speed changes dispatched by scroll.js (voice commands)
    window.addEventListener('rockstar-speed-changed', (e) => {
      const speedEl = document.getElementById('summary-speed');
      if (speedEl && e.detail) speedEl.innerText = e.detail.speed;
    });
    // Sync initial state
    updateScrollToggleState(window.RockstarCore.isScrolling || false);

    // Click triggers for dropdowns
    const notesTrigger = document.getElementById('summary-notes-trigger');
    const tipsTrigger = document.getElementById('summary-tips-trigger');

    if (notesTrigger) {
      notesTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (tipsTrigger) tipsTrigger.classList.remove('active');
        notesTrigger.classList.toggle('active');
      });
    }

    if (tipsTrigger) {
      tipsTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (notesTrigger) notesTrigger.classList.remove('active');
        tipsTrigger.classList.toggle('active');
      });
    }

    // Click outside to close dropdowns
    document.addEventListener('click', (e) => {
      if (notesTrigger && !notesTrigger.contains(e.target)) {
        notesTrigger.classList.remove('active');
      }
      if (tipsTrigger && !tipsTrigger.contains(e.target)) {
        tipsTrigger.classList.remove('active');
      }
    });

    // Panel de réglages rapide
    settingsPanel = document.createElement('div');
    settingsPanel.id = 'ug-voice-settings-panel';
    settingsPanel.className = 'ug-voice-settings-panel';
    settingsPanel.innerHTML = `
      <div class="settings-panel-header">
        <span>⚙️ Réglages Guitar Tuner & Metronome</span>
        <button id="ug-voice-settings-close" class="settings-panel-close">&times;</button>
      </div>
      <div class="settings-panel-body">
        <div class="settings-section">
          <div class="settings-section-title">Détection d'Accords</div>
          <label class="settings-row">
            <input type="checkbox" id="settings-chord-7th">
            <span>Accords de 7ème (7, maj7, m7)</span>
          </label>
          <label class="settings-row">
            <input type="checkbox" id="settings-chord-sus">
            <span>Accords suspendus (sus2, sus4)</span>
          </label>
        </div>
        
        <div class="settings-section">
          <div class="settings-section-title">Contrôle Vocal</div>
          <div class="settings-field">
            <label for="settings-wake-word">Mot déclencheur :</label>
            <input type="text" id="settings-wake-word" placeholder="Roddy">
          </div>
          <div class="settings-field">
            <label for="settings-wake-word-variants">Variantes (séparées par virgules) :</label>
            <input type="text" id="settings-wake-word-variants" placeholder="Ex: roadie, roady...">
          </div>
          <div class="settings-field">
            <label for="settings-inactivity-delay">Fermeture auto du micro :</label>
            <select id="settings-inactivity-delay">
              <option value="1">Après 1 minute (Recommandé)</option>
              <option value="2">Après 2 minutes</option>
              <option value="5">Après 5 minutes</option>
              <option value="10">Après 10 minutes</option>
              <option value="0">Désactivée (Toujours ouvert)</option>
            </select>
          </div>
          <div class="settings-field" style="display: flex; flex-direction: column; align-items: stretch;">
            <label for="settings-wake-active-duration">Durée d'activation :</label>
            <select id="settings-wake-active-duration" style="width: 100%;">
              <option value="5">5 secondes</option>
              <option value="10">10 secondes (Recommandé)</option>
              <option value="15">15 secondes</option>
              <option value="20">20 secondes</option>
              <option value="30">30 secondes</option>
            </select>
            <p style="font-size: 10px; color: #a1a1aa; margin: 4px 0 0 0; line-height: 1.3; font-weight: normal;">
              Temps restant pour enchaîner les commandes sans redire « <span class="floating-wake-word-display">Roddy</span> ».
            </p>
          </div>
        </div>

        <div class="settings-section">
          <label class="settings-row">
            <input type="checkbox" id="settings-mute-all-sites">
            <span>Silencieux sur les autres sites</span>
          </label>
        </div>
        <div class="settings-section" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
          <button id="settings-replay-onboarding" style="width: 100%; background: linear-gradient(135deg, #f26419 0%, #f6921e 100%); border: none; border-radius: 8px; color: #fff; padding: 10px; font-weight: 600; cursor: pointer; font-family: 'Outfit', sans-serif;">📖 Recommencer le tutoriel</button>
        </div>
      </div>
    `;
    document.body.appendChild(settingsPanel);

    // Interaction du Panel
    const settingsBtn = document.getElementById('ug-voice-settings-btn');
    const closeBtn = document.getElementById('ug-voice-settings-close');

    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = settingsPanel.style.display === 'flex';
      settingsPanel.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        // Fermer les autres volets
        if (helpPanel) helpPanel.style.display = 'none';
        if (commandsWrapper) commandsWrapper.classList.remove('active');
        if (commandsPanel) commandsPanel.classList.remove('visible');
        const markersPanel = document.getElementById('rockstar-markers-panel');
        if (markersPanel) markersPanel.classList.remove('visible');
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsPanel.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
      if (settingsPanel && !settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.style.display = 'none';
      }
    });

    // Panel d'aide rapide
    helpPanel = document.createElement('div');
    helpPanel.id = 'ug-voice-help-panel';
    helpPanel.className = 'ug-voice-settings-panel';
    helpPanel.innerHTML = `
      <div class="settings-panel-header">
        <span>❓ Aide & Commandes</span>
        <button id="ug-voice-help-close" class="settings-panel-close">&times;</button>
      </div>
      <div class="settings-panel-body" style="font-size: 12px; line-height: 1.4;">
        <p style="margin-top: 0; color: #a1a1aa; font-size: 11px;"><strong>Roddy</strong> est l'assistant vocal de <em>Guitar Tuner & Metronome</em>. Prononcez son nom (par défaut <b style="color: #f6921e;">"Roddy"</b>) suivi d'une commande.</p>
        
        <div class="settings-section">
          <div class="settings-section-title" style="color: #f6921e; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px; margin-bottom: 4px; font-size: 11px; text-transform: uppercase;">🎸 Tablature</div>
          <ul style="padding-left: 16px; margin: 0; color: #d4d4d8; display: flex; flex-direction: column; gap: 4px; list-style-type: disc;">
            <li><b>"search [morceau]"</b> / <b>"cherche [morceau]"</b></li>
            <li><b>"cherche dans ma playlist [morceau]"</b></li>
            <li><b>"défile"</b> (défilement automatique)</li>
            <li><b>"descends un peu / beaucoup"</b></li>
            <li><b>"monte / remonte un peu / beaucoup"</b></li>
            <li><b>"pause"</b> (arrêt défilement)</li>
            <li><b>"début"</b> (retour en haut)</li>
            <li><b>"plus vite"</b> / <b>"moins vite"</b></li>
            <li><b>"dors"</b> / <b>"stop"</b> (veille micro)</li>
          </ul>
        </div>

        <div class="settings-section" style="margin-top: 10px;">
          <div class="settings-section-title" style="color: #f6921e; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px; margin-bottom: 4px; font-size: 11px; text-transform: uppercase;">📹 Vidéo (YouTube)</div>
          <ul style="padding-left: 16px; margin: 0; color: #d4d4d8; display: flex; flex-direction: column; gap: 4px; list-style-type: disc;">
            <li><b>"lecture"</b> / <b>"joue"</b> / <b>"play"</b></li>
            <li><b>"pause"</b> / <b>"stop"</b></li>
            <li><b>"recule [de X secondes]"</b></li>
            <li><b>"avance [de X secondes]"</b></li>
            <li><b>"recommence"</b></li>
            <li><b>"vitesse [0.25 - 4.0]"</b></li>
            <li><b>"vitesse normale"</b></li>
            <li><b>"enregistre le repère [nom]"</b></li>
            <li><b>"retourne au repère [nom]"</b></li>
          </ul>
        </div>

        <div class="settings-section" style="margin-top: 10px;">
          <div class="settings-section-title" style="color: #f6921e; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px; margin-bottom: 4px; font-size: 11px; text-transform: uppercase;">⏱️ Métronome</div>
          <ul style="padding-left: 16px; margin: 0; color: #d4d4d8; display: flex; flex-direction: column; gap: 4px; list-style-type: disc;">
            <li><b>"démarre le métronome"</b></li>
            <li><b>"arrête le métronome"</b></li>
            <li><b>"tempo [40 - 240]"</b> (ex: "tempo 120")</li>
            <li><b>"mesure [4/4, 3/4...]"</b></li>
            <li><b>"son [bois, digital...]"</b></li>
            <li><b>"volume [0 - 100]"</b></li>
          </ul>
        </div>
        <div class="settings-section" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
          <button id="help-replay-onboarding" style="width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: var(--accent-gold); padding: 8px; font-weight: 600; cursor: pointer; font-family: 'Outfit', sans-serif;">📖 Rejouer le tutoriel interactif</button>
        </div>
      </div>
    `;
    document.body.appendChild(helpPanel);

    // Interaction d'aide
    const helpBtn = document.getElementById('ug-voice-help-btn');
    const helpCloseBtn = document.getElementById('ug-voice-help-close');

    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = helpPanel.style.display === 'flex';
      helpPanel.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        // Fermer les autres volets
        settingsPanel.style.display = 'none';
        if (commandsWrapper) commandsWrapper.classList.remove('active');
        if (commandsPanel) commandsPanel.classList.remove('visible');
        const markersPanel = document.getElementById('rockstar-markers-panel');
        if (markersPanel) markersPanel.classList.remove('visible');
      }
    });

    helpCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      helpPanel.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
      if (helpPanel && !helpPanel.contains(e.target) && e.target !== helpBtn) {
        helpPanel.style.display = 'none';
      }
    });

    // Liaison des données aux préférences
    const cb7th = document.getElementById('settings-chord-7th');
    const cbSus = document.getElementById('settings-chord-sus');
    const wwInput = document.getElementById('settings-wake-word');
    const wwVariantsInput = document.getElementById('settings-wake-word-variants');
    const idSelect = document.getElementById('settings-inactivity-delay');
    const wadSelect = document.getElementById('settings-wake-active-duration');
    const mutAll = document.getElementById('settings-mute-all-sites');

    function populatePanelFields(s) {
      if (cb7th) cb7th.checked = s.chord7th || false;
      if (cbSus) cbSus.checked = s.chordSus || false;
      if (wwInput) wwInput.value = s.wakeWord || 'Roddy';
      if (wwVariantsInput) wwVariantsInput.value = s.wakeWordVariants || '';
      if (idSelect) idSelect.value = s.inactivityDelay !== undefined ? s.inactivityDelay : '1';
      if (wadSelect) wadSelect.value = s.wakeActiveDuration !== undefined ? s.wakeActiveDuration : '10';
      if (mutAll) mutAll.checked = s.muteAllSites || false;
    }

    // Réagir aux changements dans RockstarCore
    window.RockstarCore.onSettingsChanged((s) => {
      populatePanelFields(s);
      const floatWwDisplays = document.querySelectorAll('.floating-wake-word-display');
      floatWwDisplays.forEach(el => {
        el.textContent = s.wakeWord || 'Roddy';
      });
    });

    // Enregistrer les modifications
    cb7th.addEventListener('change', () => {
      window.RockstarCore.safeStorageSyncSet({ chord7th: cb7th.checked });
    });
    cbSus.addEventListener('change', () => {
      window.RockstarCore.safeStorageSyncSet({ chordSus: cbSus.checked });
    });
    wwInput.addEventListener('input', () => {
      window.RockstarCore.safeStorageSyncSet({ wakeWord: wwInput.value.trim() });
    });
    wwVariantsInput.addEventListener('input', () => {
      window.RockstarCore.safeStorageSyncSet({ wakeWordVariants: wwVariantsInput.value.trim() });
    });
    idSelect.addEventListener('change', () => {
      window.RockstarCore.safeStorageSyncSet({ inactivityDelay: parseInt(idSelect.value, 10) });
    });
    if (wadSelect) {
      wadSelect.addEventListener('change', () => {
        window.RockstarCore.safeStorageSyncSet({ wakeActiveDuration: parseInt(wadSelect.value, 10) });
      });
    }
    mutAll.addEventListener('change', () => {
      window.RockstarCore.safeStorageSyncSet({ muteAllSites: mutAll.checked });
    });

    const settingsReplayBtn = document.getElementById('settings-replay-onboarding');
    if (settingsReplayBtn) {
      settingsReplayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.style.display = 'none';
        if (window.RockstarCore.startOnboarding) {
          window.RockstarCore.startOnboarding(true);
        }
      });
    }

    const helpReplayBtn = document.getElementById('help-replay-onboarding');
    if (helpReplayBtn) {
      helpReplayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        helpPanel.style.display = 'none';
        if (window.RockstarCore.startOnboarding) {
          window.RockstarCore.startOnboarding(true);
        }
      });
    }

    // 3. Indicateur de vitesse
    speedContainer = document.createElement('div');
    speedContainer.id = 'ug-voice-speed';
    speedContainer.innerText = 'Speed: ' + window.RockstarCore.scrollSpeed;
    document.body.appendChild(speedContainer);

    // 4. Bouton et panneau flottant d'aide aux commandes
    commandsWrapper = document.createElement('div');
    commandsWrapper.className = 'rockstar-commands-wrapper';

    commandsBtn = document.createElement('button');
    commandsBtn.id = 'ug-commands-btn';
    commandsBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="floating-btn-svg" style="display: block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="9" x2="15" y1="9" y2="9"/><line x1="9" x2="15" y1="13" y2="13"/><line x1="9" x2="13" y1="17" y2="17"/></svg>`;
    commandsBtn.title = 'Afficher les commandes disponibles';
    commandsWrapper.appendChild(commandsBtn);

    commandsPanel = document.createElement('div');
    commandsPanel.id = 'ug-commands-panel';
    commandsWrapper.appendChild(commandsPanel);

    commandsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = commandsWrapper.classList.toggle('active');
      commandsPanel.classList.toggle('visible', isActive);
      if (isActive) {
        if (settingsPanel) settingsPanel.style.display = 'none';
        if (helpPanel) helpPanel.style.display = 'none';
        const markersPanel = document.getElementById('rockstar-markers-panel');
        if (markersPanel) markersPanel.classList.remove('visible');
        updateCommandsPanel();
      }
    });

    document.addEventListener('click', (e) => {
      if (commandsPanel && !commandsPanel.contains(e.target) && e.target !== commandsBtn) {
        commandsWrapper.classList.remove('active');
        commandsPanel.classList.remove('visible');
      }
    });

    // Remplir et attacher la barre d'outils
    appendButtonsToFloatingBar();

    // Création du bouton de masquage de la colonne de widgets
    const toggleWidgetsBtn = document.createElement('button');
    toggleWidgetsBtn.id = 'ug-widgets-toggle-btn';
    toggleWidgetsBtn.className = 'ug-widgets-toggle-btn';
    toggleWidgetsBtn.innerHTML = `&#8250;`; // Arrow pointing right (hide)
    toggleWidgetsBtn.title = "Masquer la colonne de widgets";
    document.body.appendChild(toggleWidgetsBtn);

    // Initial state matching listening state
    function updateToggleBtnVisibility() {
      if (window.RockstarCore.isListening) {
        toggleWidgetsBtn.classList.add('visible');
      } else {
        toggleWidgetsBtn.classList.remove('visible');
        document.body.classList.remove('ug-widgets-hidden');
        toggleWidgetsBtn.innerHTML = `&#8250;`;
        toggleWidgetsBtn.title = "Masquer la colonne de widgets";
      }
    }

    // Toggle logic
    toggleWidgetsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = document.body.classList.toggle('ug-widgets-hidden');
      toggleWidgetsBtn.innerHTML = isHidden ? `&#8249;` : `&#8250;`;
      toggleWidgetsBtn.title = isHidden ? "Afficher les widgets" : "Masquer la colonne de widgets";
    });

    // Listen to listening state changes to show/hide the toggle button itself
    window.RockstarCore.onListeningChanged(() => {
      updateToggleBtnVisibility();
    });

    updateToggleBtnVisibility();

    // Synchronisation de l'état initial pour éviter les race conditions
    if (window.RockstarCore.isListening) {
      btn.classList.add('listening');
      if (window.RockstarCore.isAwake) {
        btn.classList.add('awake');
        statusSpan.innerText = "À l'écoute";
        btn.title = 'Listening... Click to turn off';
      } else {
        const settings = window.RockstarCore.settings;
        btn.title = `Listening for "${settings.wakeWord}"... Click to turn off`;
        statusSpan.innerText = `Listening (Say ${settings.wakeWord}...)`;
      }
    }
  });
})();
