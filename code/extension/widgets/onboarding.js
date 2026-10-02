// widgets/onboarding.js
/**
 * Visite guidée (onboarding) — fonctionne dans les deux contextes :
 *  - page web (content script) : étapes 1-4, centrées sur le pill flottant ;
 *  - side panel (document d'extension) : étapes 5-7, sur les onglets du panneau.
 *
 * Enchaînement page → panneau : à l'étape 4, l'utilisateur est invité à
 * cliquer lui-même sur le bouton volet du pill. Son clic pose le drapeau
 * `rockstar_onboarding_stage = 'panel'` ; le panneau, au chargement, lit ce
 * drapeau et démarre ses propres étapes. Si le panneau est refermé pendant
 * les étapes 5-7 (déconnexion du port dans background.js), le tour est
 * marqué comme terminé — pas de reprise inattendue.
 */
(function() {
  if (!window.RockstarCore) return;

  const STAGE_KEY = 'rockstar_onboarding_stage';
  const PANEL_TOUR_ACTIVE_KEY = 'rockstar_onboarding_panel_tour_active';
  const DONE_KEY = 'rockstar_onboarding_completed';

  const inPanel = Boolean(window.RockstarCore.isExtensionPage);

  let activeStep = 0;
  let overlayEl = null; // SVG unique : dim global + un trou par zone cible
  let cardEl = null;
  let isTourRunning = false;

  let panelBtnListener = null; // étape 4 : attente du clic sur le bouton volet

  function wakeWord() {
    const s = window.RockstarCore.settings || {};
    return s.wakeWord || 'Roddy';
  }

  // --- Étapes côté page (le pill flottant) ------------------------------------
  const pageSteps = [
    {
      title: '🎸 Bienvenue !',
      selector: '#rockstar-floating-pill',
      placement: 'right',
      desc: () => `Voici votre assistant musical.<br><br>Attrapez la poignée et déplacez-le où vous voulez sur la page : il reste toujours à portée de main.`
    },
    {
      title: '🎤 La voix, d’abord',
      selector: '#rfp-mic-btn',
      placement: 'right',
      desc: () => `Cliquez sur le micro pour réveiller l’assistant, puis dites <b>« ${wakeWord()} »</b> suivi d’une commande — par exemple <b>« ${wakeWord()}, c’est parti »</b> pour faire défiler la tablature.<br><br><i>💡 Une fois réveillé, inutile de répéter « ${wakeWord()} » : enchaînez vos commandes.</i>`
    },
    {
      title: '🖱️ Contrôles du morceau',
      selector: ['#rfp-actions', '.rfp-chips'],
      combined: true, // rect englobant : boutons + puces d'un seul highlight
      placement: 'right',
      desc: () => `Lecture du défilement, vitesse, capo, transposition et tonalité : tout se règle d’un clic sur le pill.<br><br>Chacun de ces réglages marche aussi à la voix.`
    },
    {
      title: '🗂️ Ouvrez le volet latéral',
      selector: '#rfp-panel-btn',
      placement: 'right',
      desc: () => `Tous les outils complets vous attendent dans le volet latéral.<br><br><b>Cliquez sur le bouton volet</b> (surligné) pour ouvrir — la visite continue à l’intérieur.`,
      waitForClick: true
    }
  ];

  // --- Étapes côté panneau (les onglets) --------------------------------------
  // Chaque étape cible DEUX éléments : le bouton d'onglet ET sa section de
  // contenu — le contenu expliqué reste visible pendant le highlight.
  const panelSteps = [
    {
      title: '🎛️ Onglet « Studio »',
      selector: ['[data-maintab="studio"]', '#sp-maintab-studio'],
      activateTab: true,
      placement: 'bottom',
      desc: () => `Les outils pour répéter vos morceaux : accordeur, métronome, clavier, détection d’accords…`
    },
    {
      title: '📝 Onglet « Chanson »',
      selector: ['[data-maintab="song"]', '#sp-maintab-song'],
      activateTab: true,
      placement: 'bottom',
      desc: () => `Les notes de la chanson en cours, avec ses liens YouTube, Spotify et autres.<br><br>Si la page n’est pas encore dans votre répertoire, le bouton « Ajouter cette page » l’enregistre en un clic.`
    },
    {
      title: '📚 Onglet « Répertoire »',
      selector: ['[data-maintab="repertoire"]', '#sp-maintab-repertoire'],
      activateTab: true,
      placement: 'bottom',
      desc: () => `Toutes vos chansons enregistrées, avec leurs notes et liens associés — conservés d’une session à l’autre.`
    }
  ];

  function steps() {
    return inPanel ? panelSteps : pageSteps;
  }

  // --- Montage / démontage ------------------------------------------------------
  // Un seul overlay SVG : le dim couvre tout, le masque déclare un trou
  // par rect cible (plusieurs trous coexistent, aucun n'assombrit les
  // autres) + un contour orange par trou.
  const NS = 'http://www.w3.org/2000/svg';
  const MASK_ID = 'rockstar-onb-mask';
  const DIM_PAGE = 0.72;   // opacité du dim (page) — volontairement légère
  const DIM_PANEL = 0.8;   // un peu plus dense dans le panneau étroit

  function ensureOverlay() {
    if (!overlayEl) {
      overlayEl = document.createElementNS(NS, 'svg');
      overlayEl.classList.add('rockstar-onboarding-overlay');
      document.body.appendChild(overlayEl);
    }
    return overlayEl;
  }

  function destroyOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function createTourElements() {
    ensureOverlay();
    if (!cardEl) {
      cardEl = document.createElement('div');
      cardEl.className = 'rockstar-onboarding-card';
      document.body.appendChild(cardEl);
    }
  }

  function destroyTourElements() {
    unbindPanelButtonWait();
    destroyOverlay();
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

  function getTargetRects(sel, combined) {
    if (Array.isArray(sel)) {
      // Cible multi-éléments : un rect par élément (ex. onglet + contenu) ;
      // si `combined`, tout fusionné en un seul rect englobant.
      const rects = [];
      sel.forEach((s) => {
        const el = document.querySelector(s);
        if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return;
        rects.push(el.getBoundingClientRect());
      });
      if (combined && rects.length > 1) {
        const top = Math.min(...rects.map((r) => r.top));
        const left = Math.min(...rects.map((r) => r.left));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        const right = Math.max(...rects.map((r) => r.right));
        return [{ top, left, bottom, right, width: right - left, height: bottom - top }];
      }
      return rects;
    }
    const el = getTarget(sel);
    return el ? [el.getBoundingClientRect()] : [];
  }

  function positionTourCard(rects, placement) {
    if (!cardEl) return;
    cardEl.style.transform = ''; // nettoyage des transforms de centrage

    ensureOverlay();
    const dimAlpha = inPanel ? DIM_PANEL : DIM_PAGE;
    const w = Math.max(window.innerWidth, document.documentElement.clientWidth || 0);
    const h = Math.max(window.innerHeight, document.documentElement.clientHeight || 0);
    const safeRects = rects || [];

    // Masque : blanc (visible) partout, noir (trou transparent) par cible.
    const holeRects = safeRects
      .map((r) => `<rect x="${Math.max(0, r.left - 6)}" y="${Math.max(0, r.top - 6)}" width="${r.width + 12}" height="${r.height + 12}" rx="12" fill="black"/>`)
      .join('');
    const strokeRects = safeRects
      .map((r) => `<rect x="${Math.max(0, r.left - 6)}" y="${Math.max(0, r.top - 6)}" width="${r.width + 12}" height="${r.height + 12}" rx="12" fill="none" stroke="#f6921e" stroke-width="2"/>`)
      .join('');
    overlayEl.setAttribute('width', String(w));
    overlayEl.setAttribute('height', String(h));
    overlayEl.innerHTML =
      `<defs><mask id="${MASK_ID}" maskUnits="userSpaceOnUse">` +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="white"/>` +
      holeRects +
      `</mask></defs>` +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="rgba(9,9,11,${dimAlpha})" mask="url(#${MASK_ID})"/>` +
      strokeRects;

    if (!safeRects.length) {
      // Pas de cible : carte centrée.
      cardEl.style.top = '50%';
      cardEl.style.left = '50%';
      cardEl.style.transform = 'translate(-50%, -50%) scale(1)';
      return;
    }

    const cardRect = cardEl.getBoundingClientRect();

    // Carte ancrée au DERNIER rect (pour le panneau : la section de
    // contenu) ; les étapes à rect unique retombent sur le même rect.
    const anchor = rects[rects.length - 1];
    let top = 0;
    let left = 0;

    if (placement === 'left') {
      top = anchor.top + (anchor.height - cardRect.height) / 2;
      left = anchor.left - cardRect.width - 15;
    } else if (placement === 'right') {
      top = anchor.top + (anchor.height - cardRect.height) / 2;
      left = anchor.right + 15;
    } else if (placement === 'bottom') {
      top = anchor.bottom + 15;
      left = anchor.left + (anchor.width - cardRect.width) / 2;
    } else { // top
      top = anchor.top - cardRect.height - 15;
      left = anchor.left + (anchor.width - cardRect.width) / 2;
    }

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

  // --- Attente du clic panneau (étape 4) ---------------------------------------
  function unbindPanelButtonWait() {
    if (panelBtnListener) {
      const btn = document.getElementById('rfp-panel-btn');
      if (btn) btn.removeEventListener('click', panelBtnListener, true);
      panelBtnListener = null;
    }
  }

  function bindPanelButtonWait() {
    unbindPanelButtonWait();
    const btn = document.getElementById('rfp-panel-btn');
    if (!btn) return;
    panelBtnListener = () => {
      unbindPanelButtonWait();
      if (!isTourRunning || activeStep !== pageSteps.length - 1) return;
      // Transfert vers le panneau : drapeau consommé par le panneau au
      // chargement. Le tour de page se replie sans marquer « terminé ».
      window.RockstarCore.safeStorageSet({ [STAGE_KEY]: 'panel' });
      destroyTourElements();
    };
    btn.addEventListener('click', panelBtnListener, true);
  }

  // --- Rendu --------------------------------------------------------------------
  function renderStep() {
    if (!cardEl || !isTourRunning) return;

    const list = steps();
    const step = list[activeStep];

    // Panneau : activer l'onglet présenté, sinon sa section de contenu est
    // en display:none et le trou du spotlight ne révèle rien.
    if (inPanel && step.activateTab) {
      const tabBtn = document.querySelector(step.selector[0]);
      if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
    }

    const targets = getTargetRects(step.selector, step.combined);
    const descText = typeof step.desc === 'function' ? step.desc() : step.desc;
    const isLast = activeStep === list.length - 1;
    const isNextDisabled = Boolean(step.waitForClick);

    cardEl.innerHTML = `
      <div class="onboarding-card-header">
        <span class="onboarding-card-step">Étape ${activeStep + 1} sur ${list.length}</span>
        <button id="tour-close-cross" style="background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:16px;">&times;</button>
      </div>
      <div class="onboarding-card-title">${step.title}</div>
      <div class="onboarding-card-desc">${descText}</div>
      <div class="onboarding-card-footer">
        <button class="onboarding-btn-skip" id="tour-btn-skip">Passer</button>
        <div class="onboarding-nav-group">
          ${activeStep > 0 ? `<button class="onboarding-btn-nav secondary" id="tour-btn-prev">Précédent</button>` : ''}
          <button class="onboarding-btn-nav primary" id="tour-btn-next" ${isNextDisabled ? 'disabled' : ''}>
            ${isLast && !step.waitForClick ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      cardEl.classList.add('visible');
      positionTourCard(targets, step.placement);
    });

    window.removeEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);

    const nextBtn = document.getElementById('tour-btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (activeStep < list.length - 1) {
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
    if (skipBtn) skipBtn.addEventListener('click', completeTour);

    const closeCross = document.getElementById('tour-close-cross');
    if (closeCross) closeCross.addEventListener('click', completeTour);

    if (step.waitForClick) bindPanelButtonWait();
  }

  function handleResize() {
    if (!isTourRunning) return;
    const step = steps()[activeStep];
    positionTourCard(getTargetRects(step.selector, step.combined), step.placement);
  }

  // Le pill est déplaçable à la poignée : spotlight et carte suivent.
  if (!inPanel) {
    window.addEventListener('rockstar-pill-moved', handleResize);
  }

  // --- Cycle de vie ---------------------------------------------------------------
  function startOnboarding() {
    if (isTourRunning) return;

    // Fermer les autres panneaux de page (aide, réglages de la barre historique).
    if (!inPanel) {
      const helpPanel = document.getElementById('ug-voice-help-panel');
      const settingsPanel = document.getElementById('ug-voice-settings-panel');
      if (helpPanel) helpPanel.style.display = 'none';
      if (settingsPanel) settingsPanel.style.display = 'none';
    }

    activeStep = 0;
    isTourRunning = true;
    createTourElements();
    renderStep();
  }

  function completeTour() {
    const payload = { [DONE_KEY]: true };
    payload[STAGE_KEY] = false;
    payload[PANEL_TOUR_ACTIVE_KEY] = false;
    window.RockstarCore.safeStorageSet(payload);
    destroyTourElements();
    window.dispatchEvent(new CustomEvent('rockstar-onboarding-completed'));
  }

  window.RockstarCore.startOnboarding = startOnboarding;

  // --- Déclenchement automatique ----------------------------------------------------
  window.RockstarCore.registerInit(() => {
    if (inPanel) {
      // Bouton « Revoir la visite » : relance la partie page sur l'onglet
      // actif (le panneau ne partage pas son DOM avec la page).
      const replayBtn = document.getElementById('sp-replay-tour');
      if (replayBtn) {
        replayBtn.addEventListener('click', () => {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab) return;
            chrome.runtime.sendMessage({ type: 'rockstar:replay-onboarding', tabId: tab.id }, () => {
              void chrome.runtime.lastError;
            });
          });
        });
      }
      // Panneau : démarrer les étapes 5-7 si la visite de page s'est achevée
      // sur le clic du bouton volet (drapeau posé par la page).
      window.RockstarCore.safeStorageGet([STAGE_KEY], (res) => {
        if (res && res[STAGE_KEY] === 'panel') {
          window.RockstarCore.safeStorageSet({ [PANEL_TOUR_ACTIVE_KEY]: true });
          // Laisser le temps aux onglets et widgets du panneau de se monter.
          setTimeout(startOnboarding, 600);
        }
      });
      return;
    }

    // Page : première visite.
    window.RockstarCore.safeStorageGet(DONE_KEY, (res) => {
      if (res && res[DONE_KEY]) return;
      setTimeout(() => {
        const currentDomain = window.RockstarCore.currentDomain;
        window.RockstarCore.safeStorageSyncGet('allowedDomains', (syncRes) => {
          const allowedDomains = (syncRes && syncRes.allowedDomains) || {};
          const isUG = currentDomain.endsWith('ultimate-guitar.com');
          const isYT = currentDomain.endsWith('youtube.com');
          const isDemoPage = window.location.pathname.includes('demo.html');
          if (isUG || isYT || isDemoPage || allowedDomains[currentDomain] === true) {
            startOnboarding();
          }
        });
      }, 2000);
    });
  });

  // --- « Revoir la visite » (onglet ⚙ du panneau → page active) -----------------------
  if (!inPanel && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'rockstar:replay-onboarding') {
        window.RockstarCore.safeStorageSet({ [DONE_KEY]: false, [STAGE_KEY]: 'page', [PANEL_TOUR_ACTIVE_KEY]: false });
        startOnboarding();
      }
    });
  }
})();
