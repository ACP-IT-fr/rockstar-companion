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
  let speedContainer = null;
  let bannerEl = null;
  let commandsWrapper = null;

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
  }

  function showFeedback(text, isSuccess) {
    if (!feedbackContainer) return;
    const toast = document.createElement('div');
    toast.className = 'ug-voice-toast ' + (isSuccess ? 'success' : 'error');
    toast.innerText = text;
    feedbackContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  function showActivationBanner() {
    if (document.getElementById('ug-voice-activation-banner') || bannerEl) return;
    
    const currentDomain = window.RockstarCore.currentDomain;

    bannerEl = document.createElement('div');
    bannerEl.id = 'ug-voice-activation-banner';
    bannerEl.innerHTML = `
      <div class="activation-banner-title">🎙️ Vox Roddy</div>
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
    let title = "Commandes Rockstar";
    
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

  window.RockstarCore.onAwakeChanged((isAwake) => {
    if (!window.RockstarCore.isListening) return;
    if (btn) {
      btn.classList.toggle('awake', isAwake);
      if (statusSpan) {
        statusSpan.innerText = isAwake ? "À l'écoute" : 'Veille';
      }
      if (isAwake) {
        btn.title = 'Listening... Click to turn off';
      } else {
        const settings = window.RockstarCore.settings;
        btn.title = `Listening for "${settings.wakeWord}"... Click to turn off`;
        if (statusSpan) {
          statusSpan.innerText = `Listening (Say ${settings.wakeWord}...)`;
        }
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
    `;
    document.body.appendChild(liveTextContainer);

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
      if (isActive) {
        updateCommandsPanel();
      }
    });

    document.addEventListener('click', (e) => {
      if (commandsPanel && !commandsPanel.contains(e.target) && e.target !== commandsBtn) {
        commandsWrapper.classList.remove('active');
      }
    });

    // Remplir et attacher la barre d'outils
    appendButtonsToFloatingBar();

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
