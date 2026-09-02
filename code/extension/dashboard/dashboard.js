/**
 * Dashboard Audio Tools — montage des widgets dans la grille.
 *
 * Les widgets (metronome, tuner, chordDetector, singingTracker, pianoKeyboard)
 * sont les fichiers originaux de l'extension. Ils s'initialisent via
 * RockstarCore.registerInit() et créent leurs DOM dans document.body.
 * Ce script :
 *   1. Déclenche l'initialisation (initialize)
 *   2. Déplace chaque widget dans sa carte
 *   3. Gère le micro global, les paramètres, la barre de statut
 */

(function() {
  'use strict';

  // Mapping widgetId → cardId
  const WIDGET_MAP = {
    'ug-metronome': 'card-metronome',
    'ug-tuner': 'card-tuner',
    'ug-chord': 'card-chord',
    'ug-singing-tracker': 'card-singing',
    'rockstar-piano-widget': 'card-piano',
  };

  // --- Bootstrap ---------------------------------------------------------------
  function boot() {
    updateStatus('loading', 'Initialisation...');

    // Initialize widgets (triggers all registerInit hooks)
    if (window.RockstarCore && typeof window.RockstarCore.initialize === 'function') {
      window.RockstarCore.initialize();
    }

    // Piano creates its DOM lazily — show it before mounting
    if (window.RockstarCore && window.RockstarCore.pianoWidget && typeof window.RockstarCore.pianoWidget.show === 'function') {
      window.RockstarCore.pianoWidget.show();
    }

    // Move widgets into their cards
    mountWidgets();

    // Wire up UI
    setupSettings();
    setupMicMaster();
    setupPianoPanel();

    // Initialize chord templates from settings
    if (window.RockstarCore && window.RockstarCore.onSettingsChanged) {
      window.RockstarCore.onSettingsChanged(function(s) {
        if (typeof buildChordTemplates === 'function') {
          buildChordTemplates(s.chord7th || false, s.chordSus || false);
        }
      });
    }

    updateStatus('ready', 'Widgets prêts');
    updateAudioStatus();
  }

  // --- Mount widgets into grid cards -----------------------------------------
  function mountWidgets() {
    for (const [widgetId, cardId] of Object.entries(WIDGET_MAP)) {
      // Skip piano — it mounts itself via initPianoWidget
      if (widgetId === 'rockstar-piano-widget') {
        const pianoEl = document.getElementById(widgetId);
        const cardBody = document.querySelector(`#${cardId} .widget-card-body`);
        if (cardBody) {
          const loading = cardBody.querySelector('.widget-loading');
          if (loading) loading.remove();
          if (pianoEl && pianoEl.parentElement !== cardBody) {
            cardBody.appendChild(pianoEl);
          }
        }
        continue;
      }

      const widgetEl = document.getElementById(widgetId);
      const cardBody = document.querySelector(`#${cardId} .widget-card-body`);
      if (!cardBody) continue;

      // Remove loading placeholder
      const loading = cardBody.querySelector('.widget-loading');
      if (loading) loading.remove();

      if (widgetEl) {
        cardBody.appendChild(widgetEl);
        // Mark visible
        widgetEl.classList.add('visible');
      } else {
        cardBody.innerHTML = '<div class="widget-error">Widget introuvable.<br><small>' + widgetId + '</small></div>';
      }
    }
  }

  // --- Status bar -------------------------------------------------------------
  function updateStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-text');
    if (!dot || !label) return;

    dot.className = 'status-dot';
    if (state === 'loading') dot.classList.add('loading');
    else if (state === 'ready') dot.classList.add('active');
    else if (state === 'error') dot.classList.add('error');

    label.textContent = text;
  }

  function updateAudioStatus() {
    const audioEl = document.getElementById('status-audio');
    const micEl = document.getElementById('status-mic');

    if (window.RockstarCore) {
      const ctx = window.RockstarCore.getAudioContext();
      if (ctx && audioEl) {
        audioEl.textContent = ctx.state === 'running' ? 'Actif' : 'Suspendu';
        audioEl.style.color = ctx.state === 'running' ? '#10b981' : '#f59e0b';
      }
      if (window.RockstarCore.getAnalyser() && micEl) {
        micEl.textContent = 'Connecté';
        micEl.style.color = '#10b981';
      }
    }
  }

  // --- Mic master -------------------------------------------------------------
  function setupMicMaster() {
    const btn = document.getElementById('btn-mic-master');
    if (!btn) return;

    btn.addEventListener('click', async function() {
      if (!window.RockstarCore) return;

      const ctx = window.RockstarCore.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (window.RockstarCore.getAnalyser()) {
        // Already active — toggle off by reloading? For now just indicate
        btn.classList.toggle('active');
        btn.innerHTML = btn.classList.contains('active') ? '🎙️ Micro ON' : '🎙️ Micro';
        updateAudioStatus();
        return;
      }

      // Request mic + create shared analyser
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 16384;
        source.connect(analyser);
        window.RockstarCore.setAnalyser(analyser);

        btn.classList.add('active');
        btn.innerHTML = '🎙️ Micro ON';
        updateAudioStatus();

        // Dispatch a custom event so widgets can pick up the shared analyser
        window.dispatchEvent(new CustomEvent('rockstar-mic-ready'));
      } catch (err) {
        console.error('[Dashboard] Microphone access denied:', err);
        updateStatus('error', 'Micro refusé');
        alert("L'accès au microphone est nécessaire pour l'accordeur, le détecteur d'accords et le vocal pitch tracker.");
      }
    });
  }

  // --- Settings ---------------------------------------------------------------
  function setupSettings() {
    const btn = document.getElementById('btn-settings');
    const panel = document.getElementById('settings-panel');
    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });

    // Chord settings
    const cb7th = document.getElementById('set-chord-7th');
    const cbSus = document.getElementById('set-chord-sus');

    // Load from storage
    try {
      const saved = JSON.parse(localStorage.getItem('rockstar_dashboard_settings') || '{}');
      if (cb7th) cb7th.checked = !!saved.chord7th;
      if (cbSus) cbSus.checked = !!saved.chordSus;
    } catch(e) {}

    function saveChordSettings() {
      if (window.RockstarCore && window.RockstarCore.safeStorageSyncSet) {
        window.RockstarCore.safeStorageSyncSet({
          chord7th: cb7th && cb7th.checked,
          chordSus: cbSus && cbSus.checked
        });
      }
    }

    if (cb7th) cb7th.addEventListener('change', saveChordSettings);
    if (cbSus) cbSus.addEventListener('change', saveChordSettings);

    // Replay onboarding button
    const replayBtn = document.getElementById('settings-replay-onboarding');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        if (window.RockstarCore && window.RockstarCore.startOnboarding) {
          window.RockstarCore.startOnboarding(true);
        }
      });
    }
  }

  // --- Piano: set mount container to the card --------------------------------
  function setupPianoPanel() {
    // Piano mounts itself in the floating bar by default; we already moved
    // the DOM element via mountWidgets. Also expose keyboard handler activation
    // on card click.
    const pianoCard = document.getElementById('card-piano');
    if (!pianoCard) return;

    pianoCard.addEventListener('click', function(e) {
      // If clicking on a key or button, don't interfere
      if (e.target.closest('.piano-key') || e.target.closest('button') || e.target.closest('select')) return;
    });
  }

  // --- Keyboard shortcuts for piano ------------------------------------------
  document.addEventListener('keydown', function(e) {
    // Spacebar toggles mic master
    if (e.code === 'Space' && !e.target.closest('input, textarea, select')) {
      e.preventDefault();
      document.getElementById('btn-mic-master').click();
    }
  });

  // --- Start ------------------------------------------------------------------
  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }
})();
