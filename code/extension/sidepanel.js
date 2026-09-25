/**
 * sidepanel.js — montage des widgets dans le side panel.
 *
 * Même principe que dashboard/dashboard.js : les fichiers de widgets
 * originaux s'initialisent via RockstarCore.registerInit() et créent leur
 * DOM dans document.body ; ce script déplace ensuite chaque widget dans sa
 * carte. Les widgets restent ainsi réutilisables dans les trois contextes :
 * page web (content script), dashboard web standalone, side panel.
 */
(function() {
  'use strict';

  // widgetId (DOM) → carte du panneau
  const WIDGET_MAP = {
    'ug-metronome': 'sp-card-metronome',
    'ug-tuner': 'sp-card-tuner',
    'ug-chord': 'sp-card-chord',
    'ug-singing-tracker': 'sp-card-singing',
    'rockstar-piano-widget': 'sp-card-piano'
  };

  // --- Toggle "widgets dans le panneau" --------------------------------------
  function setupModeToggle() {
    const checkbox = document.getElementById('sp-mode-panel');
    const note = document.getElementById('sp-disabled-note');
    if (!checkbox) return;

    window.RockstarCore.safeStorageSyncGet(['useSidePanel'], (res) => {
      checkbox.checked = res.useSidePanel !== false;
      updateNote(checkbox.checked);
    });

    checkbox.addEventListener('change', () => {
      window.RockstarCore.safeStorageSyncSet({ useSidePanel: checkbox.checked });
      updateNote(checkbox.checked);
    });

    window.RockstarCore.onSettingsChanged(function(s) {
      if (checkbox.checked !== s.useSidePanel) {
        checkbox.checked = s.useSidePanel;
        updateNote(s.useSidePanel);
      }
    });

    function updateNote(enabled) {
      if (note) note.hidden = enabled;
    }
  }

  // --- Accordéons (plusieurs sections peuvent être ouvertes à la fois) --------
  function setupAccordion() {
    document.querySelectorAll('.sp-acc-head').forEach((head) => {
      head.addEventListener('click', () => {
        head.closest('.sp-acc').classList.toggle('open');
      });
    });
  }

  // --- Montage des widgets dans leurs cartes -----------------------------------
  // L'initialisation des widgets est asynchrone (core.initialize attend les
  // réglages dans chrome.storage) : on retente le montage tant qu'il reste
  // des widgets non montés, au lieu d'un unique appel trop tôt.
  function mountWidgets() {
    let missing = 0;

    Object.entries(WIDGET_MAP).forEach(([widgetId, cardId]) => {
      const widget = document.getElementById(widgetId);
      const cardBody = document.querySelector('#' + cardId + ' .widget-card-body') ||
        document.getElementById(cardId);
      if (!cardBody) return;

      if (widget && widget.parentElement !== cardBody) {
        cardBody.appendChild(widget);
        // Certains widgets démarrent avec opacity:0 (état "overlay page")
        widget.classList.add('visible');
      }
      if (!widget) missing++;
    });

    // Le piano crée son DOM paresseusement : l'afficher puis le monter.
    if (window.RockstarCore.pianoWidget && typeof window.RockstarCore.pianoWidget.show === 'function') {
      window.RockstarCore.pianoWidget.show();
    }

    // getOrCreateFloatingBar (utilisé par le piano comme conteneur par défaut)
    // a pu créer une barre flottante vide dans le panneau : on la retire.
    const strayBar = document.getElementById('rockstar-floating-bar');
    if (strayBar && !strayBar.firstChild) {
      strayBar.remove();
    }

    return missing;
  }

  function mountWhenReady() {
    let attempts = 0;
    const maxAttempts = 40; // 40 × 250 ms = 10 s max
    const timer = setInterval(() => {
      attempts++;
      const missing = mountWidgets();
      if (missing === 0 || attempts >= maxAttempts) {
        clearInterval(timer);
        if (missing > 0) {
          console.warn('[SidePanel] Widgets non montés après', attempts, 'tentatives');
        }
      }
    }, 250);
  }

  // --- Micro master -------------------------------------------------------------
  // Accordeur, détecteur d'accords et vocal pitch partagent le même analyser.
  // getUserMedia exige un geste utilisateur : un seul bouton autorise le micro
  // pour tous les widgets (même logique que le dashboard standalone).
  //
  // Limitation Chrome : les prompts de permission ne s'affichent pas depuis un
  // document de side panel (NotAllowedError "Permission dismissed"). On
  // contourne en demandant la permission une fois dans un onglet normal
  // (même origine chrome-extension://<id> → mémorisée pour le panneau aussi).
  function requestMic(btn) {
    return new Promise(async (resolve) => {
      if (!window.RockstarCore) { resolve(false); return; }

      const ctx = window.RockstarCore.getAudioContext();
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (e) { /* ignore */ }
      }

      // Les widgets ont pu créer un analyser "orphelin" au chargement (avant
      // tout geste utilisateur, leur getUserMedia est refusé) : il faut lui
      // brancher le flux, pas considérer le micro comme déjà actif.
      let analyser = window.RockstarCore.getAnalyser();
      if (!analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 16384;
        window.RockstarCore.setAnalyser(analyser);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        // Redémarre les widgets micro avec l'analyser partagé
        if (typeof window.RockstarCore.initTuner === 'function') {
          window.RockstarCore.initTuner();
        }
        if (typeof window.RockstarCore.initSingingTracker === 'function') {
          window.RockstarCore.initSingingTracker();
        }
        window.dispatchEvent(new CustomEvent('rockstar-mic-ready'));

        if (btn) {
          btn.classList.add('active');
          btn.textContent = '🎙️ Micro ON';
        }
        resolve(true);
      } catch (err) {
        console.error('[SidePanel] Accès micro refusé :', err);
        if (err.name === 'NotAllowedError' && btn) {
          // Le prompt ne peut pas s'afficher dans le panneau : proposer l'onglet
          btn.textContent = '🎙️ Autoriser via l\'onglet ouvert';
          chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html?mic=1') });
        } else if (btn) {
          btn.textContent = '🎙️ Micro refusé';
        }
        resolve(false);
      }
    });
  }

  function setupMicMaster() {
    const btn = document.getElementById('sp-mic-master');
    if (!btn) return;

    btn.addEventListener('click', () => { requestMic(btn); });

    // Ouvert en onglet avec ?mic=1 : la permission peut se demander ici
    // (le prompt fonctionne dans un onglet normal). Une fois accordée, elle
    // vaut pour l'origine entière de l'extension, donc pour le panneau.
    if (new URLSearchParams(location.search).get('mic') === '1') {
      document.title = 'Vox Roddy — autorisation du micro (tu peux fermer cet onglet ensuite)';
      requestMic(btn);
    }
  }

  // --- Bridge panneau -> onglet actif ------------------------------------------
  // Toutes les actions sur la page passent par le hub (background.js),
  // qui relaye vers le même router de commandes que le contrôle vocal.
  function sendTabCommand(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'rockstar:panel-to-tab', payload: { kind: 'command', text } },
        (res) => {
          if (chrome.runtime.lastError) {
            void chrome.runtime.lastError;
            resolve({ ok: false, error: 'no-content-script' });
            return;
          }
          resolve(res || { ok: false, error: 'no-response' });
        }
      );
    });
  }

  function showCmdStatus(text) {
    const status = document.getElementById('sp-cmd-status');
    if (!status) return;
    status.hidden = false;
    status.textContent = text;
    clearTimeout(showCmdStatus._t);
    showCmdStatus._t = setTimeout(() => { status.hidden = true; }, 2500);
  }

  function setupPlaybackTab() {
    document.querySelectorAll('.sp-cmd[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = await sendTabCommand(btn.dataset.cmd);
          if (res && res.ok) {
            showCmdStatus('✓ Commande envoyée à la page');
          } else {
            const why = res && res.error === 'no-content-script'
              ? "La page active ne contient pas l'extension (essaie sur YouTube ou ultimate-guitar)"
              : 'Commande non reconnue sur cette page';
            showCmdStatus(why);
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // --- Bootstrap ----------------------------------------------------------------
  function boot() {
    if (!window.RockstarCore || typeof window.RockstarCore.initialize !== 'function') {
      console.error('[SidePanel] RockstarCore indisponible');
      return;
    }

    window.RockstarCore.initialize();

    mountWhenReady();
    setupAccordion();
    setupModeToggle();
    setupMicMaster();
    setupPlaybackTab();
  }

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();