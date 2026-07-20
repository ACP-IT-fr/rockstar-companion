// widgets/onboarding.js
(function() {
  if (!window.RockstarCore) return;

  let activeStep = 0;
  let spotlightEl = null;
  let cardEl = null;
  let isTourRunning = false;

  // Track command simulation state in Step 2
  let simState = 'idle'; // 'idle', 'scrolling', 'paused'

  let rawListener = null;
  let cmdListener = null;

  function bindOnboardingVoiceListeners() {
    unbindOnboardingVoiceListeners(); // Avoid duplicates

    rawListener = (e) => {
      const rawVal = document.getElementById('tour-live-raw-val');
      if (rawVal) {
        rawVal.textContent = e.detail.text;
      }
    };

    cmdListener = (e) => {
      const cmdVal = document.getElementById('tour-live-cmd-val');
      if (cmdVal) {
        cmdVal.textContent = `"${e.detail.text}" (${e.detail.action})`;
        if (e.detail.success) {
          cmdVal.style.color = '#10b981';
        } else {
          cmdVal.style.color = '#ef4444';
        }
      }

      // Check transition logic
      if (!isTourRunning || activeStep !== 1) return;
      if (e.detail.success) {
        const lowerAction = e.detail.action.toLowerCase();
        const isScrollAction = lowerAction.includes('défilement');
        const isPauseAction = lowerAction.includes('pause');

        if (simState === 'idle' && isScrollAction) {
          simState = 'scrolling';
          renderStep();
        } else if (simState === 'scrolling' && isPauseAction) {
          simState = 'paused';
          renderStep();
        }
      }
    };

    window.addEventListener('rockstar-voice-raw', rawListener);
    window.addEventListener('rockstar-voice-command', cmdListener);
  }

  function unbindOnboardingVoiceListeners() {
    if (rawListener) {
      window.removeEventListener('rockstar-voice-raw', rawListener);
      rawListener = null;
    }
    if (cmdListener) {
      window.removeEventListener('rockstar-voice-command', cmdListener);
      cmdListener = null;
    }
  }

  const steps = [
    {
      title: "🎙️ Assistant Vocal",
      selector: "#ug-voice-btn",
      desc: (s) => `Contrôlez vos tablatures les mains libres.<br><br>Dites <b>« ${s.wakeWord || 'Roddy'} »</b> suivi d'une commande (ex: <i>« ${s.wakeWord || 'Roddy'}, c'est parti »</i>).<br><br><i>💡 Astuce : Une fois activé (bouton vert/jaune), enchaînez vos commandes sans répéter « ${s.wakeWord || 'Roddy'} ».</i>`,
      placement: "top"
    },
    {
      title: "🎤 À vous de jouer !",
      selector: "#ug-voice-btn",
      desc: (s) => `Prononcez <b>« ${s.wakeWord || 'Roddy'}, c'est parti »</b> (ou simulez via le bouton ci-dessous) :`,
      placement: "top",
      interactive: true
    },
    {
      title: "🎵 Réglages & Remarques",
      selector: "#ug-drawer-btn",
      desc: (s) => `Enregistrez vos notes de jeu et capos personnalisés (adaptés à votre voix).<br><br>Associez-y également une vidéo ou playlist de playback.`,
      placement: "top"
    },
    {
      title: "🎹 Clavier & Analyse",
      selector: "#ug-voice-btn-piano",
      desc: (s) => `Ouvre un clavier 88 touches interactif.<br><br>Idéal pour jouer des notes de référence ou analyser la justesse de votre voix/instrument en direct.`,
      placement: "top"
    },
    {
      title: "📋 Liste des Commandes",
      selector: "#ug-commands-btn",
      desc: (s) => `Retrouvez toutes les commandes vocales supportées.<br><br>Cette liste s'adapte automatiquement au contexte (tablature, métronome, vidéo).`,
      placement: "top"
    },
    {
      title: "🛠️ Boîte à Outils",
      selector: "#ug-widgets-toggle-btn",
      desc: (s) => `Ouvrez le panneau latéral des widgets.<br><br>Accédez en un clic à l'accordeur de guitare, au métronome, et au détecteur d'accords.`,
      placement: "left"
    },
    {
      title: "📊 Statut en Direct",
      selector: "#ug-voice-live-text",
      desc: (s) => `Suivez l'activité de l'assistant en temps réel :<br>- <b>Flux Micro</b> : paroles brutes captées.<br>- <b>Commandes</b> : historique des actions lancées.`,
      placement: "top"
    },
    {
      title: "⚙️ Configuration",
      selector: "#ug-voice-settings-btn",
      desc: (s) => `Cliquez sur l'engrenage pour régler l'assistant.<br><br>Modifiez le mot déclencheur (ex: « Roddy ») ou relancez ce tutoriel à tout moment.`,
      placement: "top"
    }
  ];

  function createTourElements() {
    if (!spotlightEl) {
      spotlightEl = document.createElement('div');
      spotlightEl.className = 'rockstar-spotlight';
      document.body.appendChild(spotlightEl);
    }
    if (!cardEl) {
      cardEl = document.createElement('div');
      cardEl.className = 'rockstar-onboarding-card';
      document.body.appendChild(cardEl);
    }
  }

  function destroyTourElements() {
    unbindOnboardingVoiceListeners();
    if (spotlightEl) {
      spotlightEl.remove();
      spotlightEl = null;
    }
    if (cardEl) {
      cardEl.remove();
      cardEl = null;
    }
    isTourRunning = false;
  }

  function getTarget(selector) {
    const el = document.querySelector(selector);
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      return el;
    }
    return null;
  }

  function positionTourCard(target, placement) {
    if (!cardEl) return;
    cardEl.style.transform = ''; // Clear center transforms

    if (!target) {
      // Center card on screen
      cardEl.style.top = '50%';
      cardEl.style.left = '50%';
      cardEl.style.transform = 'translate(-50%, -50%) scale(1)';
      if (spotlightEl) {
        spotlightEl.style.width = '0px';
        spotlightEl.style.height = '0px';
        spotlightEl.style.top = '-100px';
        spotlightEl.style.left = '-100px';
      }
      return;
    }

    const rect = target.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    
    // Position spotlight
    if (spotlightEl) {
      // Add a small padding around target
      const pad = 6;
      spotlightEl.style.top = `${rect.top - pad}px`;
      spotlightEl.style.left = `${rect.left - pad}px`;
      spotlightEl.style.width = `${rect.width + pad * 2}px`;
      spotlightEl.style.height = `${rect.height + pad * 2}px`;
    }

    let top = 0;
    let left = 0;

    if (placement === 'left') {
      top = rect.top + (rect.height - cardRect.height) / 2;
      left = rect.left - cardRect.width - 15;
    } else if (placement === 'right') {
      top = rect.top + (rect.height - cardRect.height) / 2;
      left = rect.right + 15;
    } else if (placement === 'bottom') {
      top = rect.bottom + 15;
      left = rect.left + (rect.width - cardRect.width) / 2;
    } else { // top
      top = rect.top - cardRect.height - 15;
      left = rect.left + (rect.width - cardRect.width) / 2;
    }

    // Keep card on screen bounds
    if (top < 10) top = 10;
    if (top + cardRect.height > window.innerHeight - 10) {
      top = window.innerHeight - cardRect.height - 10;
    }
    if (left < 10) left = 10;
    if (left + cardRect.width > window.innerWidth - 10) {
      left = window.innerWidth - cardRect.width - 10;
    }

    cardEl.style.top = `${top}px`;
    cardEl.style.left = `${left}px`;
  }

  function renderStep() {
    if (!cardEl || !isTourRunning) return;

    unbindOnboardingVoiceListeners();

    const step = steps[activeStep];
    const s = window.RockstarCore.settings;
    const target = getTarget(step.selector);

    let descText = typeof step.desc === 'function' ? step.desc(s) : step.desc;

    let interactiveHtml = '';
    let isNextDisabled = false;

    if (step.interactive) {
      bindOnboardingVoiceListeners();
      if (simState === 'idle') {
        interactiveHtml = `
          <div class="onboarding-interactive-section">
            <button class="onboarding-interactive-btn" id="tour-sim-scroll">🚀 Simuler "Roddy, c'est parti"</button>
            <div class="onboarding-interactive-status" style="color: #a1a1aa;">En attente d'action...</div>
            <div class="onboarding-live-voice-monitor" style="margin-top: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px; font-family: 'Outfit', sans-serif; font-size: 11px; text-align: left;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #a1a1aa;">
                <span>🎤 Flux Micro :</span>
                <span id="tour-live-raw-val" style="color: #ff8c42; font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;">Silencieux</span>
              </div>
              <div style="display: flex; justify-content: space-between; color: #a1a1aa;">
                <span>📋 Commande :</span>
                <span id="tour-live-cmd-val" style="color: #a1a1aa; font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;">-</span>
              </div>
            </div>
          </div>
        `;
        isNextDisabled = true;
      } else if (simState === 'scrolling') {
        descText = `Excellent ! La tablature défile automatiquement.<br><br>Maintenant, dites <b>« ${s.wakeWord || 'Roddy'}, pause »</b> ou cliquez ci-dessous pour arrêter le défilement.`;
        interactiveHtml = `
          <div class="onboarding-interactive-section">
            <button class="onboarding-interactive-btn" id="tour-sim-pause" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5;">⏸️ Simuler "Roddy, pause"</button>
            <div class="onboarding-interactive-status" style="color: #ff8c42;">Défilement en cours...</div>
            <div class="onboarding-live-voice-monitor" style="margin-top: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px; font-family: 'Outfit', sans-serif; font-size: 11px; text-align: left;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #a1a1aa;">
                <span>🎤 Flux Micro :</span>
                <span id="tour-live-raw-val" style="color: #ff8c42; font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;">Silencieux</span>
              </div>
              <div style="display: flex; justify-content: space-between; color: #a1a1aa;">
                <span>📋 Commande :</span>
                <span id="tour-live-cmd-val" style="color: #a1a1aa; font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 170px;">-</span>
              </div>
            </div>
          </div>
        `;
        isNextDisabled = true;
      } else { // paused / completed
        descText = `Parfait ! Vous maîtrisez les commandes vocales de base.<br><br>Vous pouvez maintenant faire défiler et arrêter la tablature d'une simple phrase ou d'un clic.`;
        interactiveHtml = `
          <div class="onboarding-interactive-section" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.2);">
            <div class="onboarding-interactive-status" style="color: #10b981; font-weight: 600;">✅ Essai complété !</div>
          </div>
        `;
        isNextDisabled = false;
      }
    }

    cardEl.innerHTML = `
      <div class="onboarding-card-header">
        <span class="onboarding-card-step">Étape ${activeStep + 1} sur ${steps.length}</span>
        <button id="tour-close-cross" style="background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:16px;">&times;</button>
      </div>
      <div class="onboarding-card-title">${step.title}</div>
      <div class="onboarding-card-desc">${descText}</div>
      ${interactiveHtml}
      <div class="onboarding-card-footer">
        <button class="onboarding-btn-skip" id="tour-btn-skip">Passer</button>
        <div class="onboarding-nav-group">
          ${activeStep > 0 ? `<button class="onboarding-btn-nav secondary" id="tour-btn-prev">Précédent</button>` : ''}
          <button class="onboarding-btn-nav primary" id="tour-btn-next" ${isNextDisabled ? 'disabled' : ''}>
            ${activeStep === steps.length - 1 ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    `;

    // Trigger visual reveal
    requestAnimationFrame(() => {
      cardEl.classList.add('visible');
      positionTourCard(target, step.placement);
    });

    // Re-position on resize or scroll
    window.removeEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);

    // Click bindings
    const nextBtn = document.getElementById('tour-btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (activeStep < steps.length - 1) {
          activeStep++;
          renderStep();
        } else {
          completeTour();
        }
      });
    }

    const prevBtn = document.getElementById('tour-btn-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (activeStep > 0) {
          activeStep--;
          renderStep();
        }
      });
    }

    const skipBtn = document.getElementById('tour-btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', completeTour);
    }

    const closeCross = document.getElementById('tour-close-cross');
    if (closeCross) {
      closeCross.addEventListener('click', completeTour);
    }

    // Step 2 interactive hooks
    const simScrollBtn = document.getElementById('tour-sim-scroll');
    if (simScrollBtn) {
      simScrollBtn.addEventListener('click', () => {
        simulateVoiceCommand("c'est parti");
      });
    }

    const simPauseBtn = document.getElementById('tour-sim-pause');
    if (simPauseBtn) {
      simPauseBtn.addEventListener('click', () => {
        simulateVoiceCommand('pause');
      });
    }
  }

  function handleResize() {
    if (!isTourRunning) return;
    const step = steps[activeStep];
    const target = getTarget(step.selector);
    positionTourCard(target, step.placement);
  }

  function simulateVoiceCommand(cmdText) {
    if (window.RockstarCore.wakeUp) {
      window.RockstarCore.wakeUp(15000, false);
    }
    // Feed the command to Core router
    window.RockstarCore.handleCommand(cmdText);
  }

  // Hook command detection to auto-advance step 2 if they use voice directly

  function startOnboarding(force = false) {
    if (isTourRunning) return;
    
    // Close other panels
    const helpPanel = document.getElementById('ug-voice-help-panel');
    const settingsPanel = document.getElementById('ug-voice-settings-panel');
    if (helpPanel) helpPanel.style.display = 'none';
    if (settingsPanel) settingsPanel.style.display = 'none';

    activeStep = 0;
    simState = 'idle';
    isTourRunning = true;

    createTourElements();
    renderStep();
  }

  function completeTour() {
    window.RockstarCore.safeStorageSet({ rockstar_onboarding_completed: true });
    destroyTourElements();
    
    // Dispatch custom event to notify integration tests
    window.dispatchEvent(new CustomEvent('rockstar-onboarding-completed'));
  }

  // Register on global core object
  window.RockstarCore.startOnboarding = startOnboarding;

  // Initialize and check auto-trigger
  window.RockstarCore.registerInit(() => {
    window.RockstarCore.safeStorageGet('rockstar_onboarding_completed', (res) => {
      if (!res.rockstar_onboarding_completed) {
        setTimeout(() => {
          const currentDomain = window.RockstarCore.currentDomain;
          window.RockstarCore.safeStorageSyncGet('allowedDomains', (syncRes) => {
            const allowedDomains = syncRes.allowedDomains || {};
            const isUG = currentDomain.endsWith('ultimate-guitar.com');
            const isYT = currentDomain.endsWith('youtube.com');
            const isGoogle = currentDomain.endsWith('google.com');
            const isDemoPage = window.location.pathname.includes('demo.html');
            if (isUG || isYT || isGoogle || isDemoPage || allowedDomains[currentDomain] === true) {
              startOnboarding();
            }
          });
        }, 2000);
      }
    });
  });
})();
