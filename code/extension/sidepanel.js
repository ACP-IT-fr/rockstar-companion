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
    // Le background ne connaît l'onglet du panneau que si le port le lui
    // annonce : sender.tab est null pour un document d'extension. On interroge
    // donc l'onglet actif et on encode son id dans le nom du port.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const portName = tab && typeof tab.id === 'number'
        ? `rockstar-panel:${tab.id}`
        : 'rockstar-panel';
      let port = null;
      try {
        port = chrome.runtime.connect({ name: portName });
      } catch (e) { return; }

      port.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.type === 'rockstar:panel-toggle') {
          try { window.close(); } catch (e) { /* ignore */ }
        } else if (msg.type === 'rockstar:show-tab' && msg.tab) {
          // « + » du pill : ajouter la page au répertoire en même temps.
          if (msg.addCurrent) {
            window.dispatchEvent(new CustomEvent('rockstar-panel-add-current'));
          }
          showMainTab(msg.tab);
        }
      });

      // --- Largeur du panneau → onglets de la fenêtre --------------------------
      // Le side panel recouvre la page sans redimensionner son viewport : la
      // page ne peut pas mesurer la zone masquée. Le panneau se mesure
      // lui-même et relaie sa largeur (au chargement, puis à chaque
      // redimensionnement) ; le hub la broadcast aux onglets.
      let widthTimer = null;
      function reportPanelWidth() {
        try { port.postMessage({ type: 'rockstar:panel-width', width: window.innerWidth }); } catch (e) { /* port fermé */ }
      }
      reportPanelWidth();
      window.addEventListener('resize', () => {
        clearTimeout(widthTimer);
        widthTimer = setTimeout(reportPanelWidth, 150);
      });
    });
  }

  function showMainTab(name) {
    if (!KNOWN_TABS.includes(name)) return;
    const nav = document.getElementById('sp-maintabs');
    const btn = nav ? nav.querySelector(`[data-maintab="${name}"]`) : null;
    // Onglet déjà actif (livre du pill) : petit effet visuel sur le contenu
    // pour signifier « il est là » plutôt que de ne rien faire.
    if (btn && btn.classList.contains('active')) {
      const section = document.getElementById('sp-maintab-' + name);
      if (section) {
        section.classList.remove('sp-tab-flash');
        void section.offsetWidth; // redémarre l'animation
        section.classList.add('sp-tab-flash');
        setTimeout(() => section.classList.remove('sp-tab-flash'), 1300);
      }
      return;
    }
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

    // Onglet demandé avant l'ouverture (ex. 📖/+ du pill → Chanson).
    // Valeurs inconnues ou onglets hérités ignorés : on reste sur Studio.
    chrome.storage.local.get(['rockstar_panel_pending_tab', 'rockstar_panel_pending_action'], (res) => {
      const pending = res && res.rockstar_panel_pending_tab;
      if (pending) {
        showMainTab(pending);
      }
      if (res && res.rockstar_panel_pending_action === 'add-current') {
        // La liste du répertoire peut ne pas être encore initialisée :
        // on pose un drapeau qu'elle consomme à son montage (+ événement
        // au cas où elle serait déjà prête).
        window.__rockstarPendingAddCurrent = true;
        window.dispatchEvent(new CustomEvent('rockstar-panel-add-current'));
      }
      if (pending || (res && res.rockstar_panel_pending_action)) {
        chrome.storage.local.remove(['rockstar_panel_pending_tab', 'rockstar_panel_pending_action']);
      }
    });
  }

  // Onglets connus ; 'repertoire' hérité du bouton 📖 historique → fiche (song).
  const KNOWN_TABS = ['studio', 'song', 'repertoire', 'settings'];

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
    const videoGroup = document.getElementById('sp-playback-video-group');
    const scrollGroup = document.getElementById('sp-playback-scroll-group');
    const unknown = document.getElementById('sp-playback-unknown');
    if (!videoGroup || !scrollGroup) return;

    refreshSongTabVisibility();
    sendTabMessage({ kind: 'getState' }).then((res) => {
      const domain = res && res.ok && res.state ? String(res.state.domain || '') : null;
      const isYouTube = Boolean(domain && domain.includes('youtube.com'));
      const hasExtension = Boolean(domain);
      // YouTube → contrôles vidéo ; autre page avec l'extension → défilement
      videoGroup.hidden = !isYouTube;
      scrollGroup.hidden = isYouTube || !hasExtension;
      if (unknown) unknown.hidden = hasExtension;
    });
  }

  // --- Onglet Chanson : visible seulement si la page active est enregistrée ---
  // La page « à côté » est interrogée via son content script (getState) ;
  // sans content script (page interne), l'onglet est masqué.
  function setSongTabVisible(visible) {
    const btn = document.querySelector('[data-maintab="song"]');
    if (!btn) return;
    btn.hidden = !visible;
    // Onglet actif devenu masqué (suppression / autre page) : retour Studio.
    if (!visible && btn.classList.contains('active')) showMainTab('studio');
  }

  function refreshSongTabVisibility() {
    const btn = document.querySelector('[data-maintab="song"]');
    if (!btn || !window.storageService) return;
    sendTabMessage({ kind: 'getState' }).then((res) => {
      const rawUrl = res && res.ok && res.state && res.state.url ? res.state.url : null;
      if (!rawUrl) {
        setSongTabVisible(false);
        return;
      }
      const url = (window.RockstarCore && typeof window.RockstarCore.normalizeUrl === 'function')
        ? window.RockstarCore.normalizeUrl(rawUrl)
        : rawUrl;
      window.storageService.getSong(url).then((song) => setSongTabVisible(Boolean(song)));
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

    // Onglet Chanson visible uniquement si la page active est enregistrée.
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.keys(changes).some((k) => k.startsWith('song:'))) {
          refreshSongTabVisibility();
        }
      });
    }

    document.querySelectorAll('.sp-cmd[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await sendTabCommand(btn.dataset.cmd);
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
  function applyPanelTitle() {
    // Le placeholder __MSG_panelTitle__ peut rester brut si Chrome n'a pas
    // re-résolu les locales : on force via chrome.i18n côté JS.
    const titleEl = document.querySelector('.sp-title');
    const msg = chrome?.i18n?.getMessage?.('panelTitle');
    if (titleEl && msg) titleEl.textContent = msg;
    if (msg) document.title = `${msg} — Panneau`;
  }

  function boot() {
    if (!window.RockstarCore || typeof window.RockstarCore.initialize !== 'function') {
      console.error('[SidePanel] RockstarCore indisponible');
      return;
    }

    window.RockstarCore.initialize();

    applyPanelTitle();
    mountWhenReady();
    setupPanelPort();
    setupMainTabs();
    setupAccordion();
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