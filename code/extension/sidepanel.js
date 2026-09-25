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
    'rockstar-piano-widget': 'sp-card-piano',
    'rockstar-drawer': 'sp-card-repertoire'
  };

  // --- Fermeture du panneau + ordres du background (toggle, changement d'onglet)
  // Le port permet aussi au background de savoir que le panneau est ouvert.
  function setupPanelPort() {
    if (!chrome.runtime || !chrome.runtime.connect) return;
    let port = null;
    try {
      port = chrome.runtime.connect({ name: 'rockstar-panel' });
    } catch (e) { return; }

    port.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'rockstar:panel-toggle') {
        try { window.close(); } catch (e) { /* ignore */ }
      } else if (msg.type === 'rockstar:show-tab' && msg.tab === 'repertoire') {
        showMainTab('repertoire');
      }
    });
  }

  function showMainTab(name) {
    document.querySelectorAll('.sp-maintab').forEach((b) => {
      b.classList.toggle('active', b.dataset.maintab === name);
    });
    document.querySelectorAll('.sp-maintab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'sp-maintab-' + name);
    });
  }

  function setupMainTabs() {
    const nav = document.getElementById('sp-maintabs');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.sp-maintab');
      if (btn) showMainTab(btn.dataset.maintab);
    });

    // Onglet demandé avant l'ouverture (ex. 📖 du pill → Répertoire)
    chrome.storage.local.get('rockstar_panel_pending_tab', (res) => {
      const pending = res && res.rockstar_panel_pending_tab;
      if (pending) {
        showMainTab(pending);
        chrome.storage.local.remove('rockstar_panel_pending_tab');
      }
    });
  }

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

  // Fermeture du panneau : le pill envoie rockstar:panel-toggle via le
  // background pour un comportement "toggle" (ouvrir / fermer).
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'rockstar:panel-toggle') {
        try { window.close(); } catch (e) { /* ignore */ }
      }
    });
  }

  // --- Bridge panneau -> onglet actif ------------------------------------------
  // Toutes les actions sur la page passent par le hub (background.js),
  // qui relaye vers le même router de commandes que le contrôle vocal.
  function sendTabCommand(text) {
    return sendTabMessage({ kind: 'command', text });
  }

  function showCmdStatus(text) {
    const status = document.getElementById('sp-cmd-status');
    if (!status) return;
    status.hidden = false;
    status.textContent = text;
    clearTimeout(showCmdStatus._t);
    showCmdStatus._t = setTimeout(() => { status.hidden = true; }, 2500);
  }

  // --- Lecture : groupe affiché selon le site de l'onglet actif ----------------
  // Onglet YouTube → contrôles vidéo ; autre page avec l'extension → contrôles
  // de défilement ; page sans extension → note explicative.
  function sendTabMessage(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'rockstar:panel-to-tab', payload },
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

  function refreshPlaybackMode() {
    const videoRow = document.getElementById('sp-playback-video');
    const scrollRow = document.getElementById('sp-playback-scroll');
    const unknown = document.getElementById('sp-playback-unknown');
    const badge = document.getElementById('sp-playback-badge');
    const title = document.getElementById('sp-playback-title');
    if (!videoRow || !scrollRow) return;

    sendTabMessage({ kind: 'getState' }).then((res) => {
      const domain = res && res.ok && res.state ? String(res.state.domain || '') : null;
      const isYouTube = Boolean(domain && domain.includes('youtube.com'));
      const hasExtension = Boolean(domain);
      const sep = document.getElementById('sp-playback-sep');
      videoRow.hidden = !isYouTube;
      if (sep) sep.hidden = !isYouTube;
      // Le défilement marche sur toute page avec l'extension (YouTube inclus)
      scrollRow.hidden = !hasExtension;
      if (unknown) unknown.hidden = hasExtension;
      if (badge) badge.textContent = hasExtension ? (isYouTube ? 'YouTube' : 'Page') : 'aucune page';
      if (title) title.textContent = isYouTube ? '▶️ Vidéo + défilement' : '📜 Défilement de la page';
    });
  }

  function setupPlaybackTab() {
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => refreshPlaybackMode());
    }
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, info) => {
        if (info.status === 'complete' || info.url) refreshPlaybackMode();
      });
    }
    refreshPlaybackMode();

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

  // --- Piano : mode compact (une octave) par défaut, bouton "Déployer" ----------
  function setupPianoCompact() {
    const toggleBtn = document.getElementById('sp-piano-toggle');
    if (!toggleBtn) return;

    function setCompact(compact) {
      const piano = document.getElementById('rockstar-piano-widget');
      if (!piano) return;
      piano.classList.toggle('sp-piano-compact', compact);
      toggleBtn.textContent = compact ? '⤢ Déployer' : '⤡ Replier';
      toggleBtn.title = compact ? 'Ouvrir la version complète' : 'Replier sur une octave';
    }

    toggleBtn.addEventListener('click', () => {
      const piano = document.getElementById('rockstar-piano-widget');
      setCompact(!piano || !piano.classList.contains('sp-piano-compact'));
    });

    // Le piano peut ne pas exister au premier passage : réapplique l'état compact
    const timer = setInterval(() => {
      const piano = document.getElementById('rockstar-piano-widget');
      if (piano) {
        setCompact(true);
        clearInterval(timer);
      }
    }, 250);
    setTimeout(() => clearInterval(timer), 10000);
  }

  // --- Bootstrap ----------------------------------------------------------------
  function boot() {
    if (!window.RockstarCore || typeof window.RockstarCore.initialize !== 'function') {
      console.error('[SidePanel] RockstarCore indisponible');
      return;
    }

    window.RockstarCore.initialize();

    mountWhenReady();
    setupPanelPort();
    setupMainTabs();
    setupAccordion();
    setupModeToggle();
    setupMicMaster();
    setupPlaybackTab();
    setupPianoCompact();
  }

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();