// widgets/floatingButton.js
/**
 * Bouton flottant unique (mode panneau latéral) — remplace la barre
 * flottante complète. Poignée déplaçable, puces d'état condensées façon
 * Transpose (Flux micro / Vitesse / Capo / Trans / Ton) et transcript du
 * flux vocal juste en dessous.
 *
 * Ne se monte QUE quand les widgets vivent dans le panneau
 * (settings.useSidePanel) ; sinon la floatingBar historique reste en place.
 */
(function() {
  if (!window.RockstarCore) return;

  const POS_KEY = 'rockstar_pill_pos';

  function initFloatingButton() {
    if (window.RockstarCore.shouldMountInPage && window.RockstarCore.shouldMountInPage()) return;
    if (document.getElementById('rockstar-floating-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'rockstar-floating-pill';
    pill.innerHTML = `
      <div class="rfp-top">
        <div class="rfp-handle" id="rfp-handle" title="Déplacer">⠿</div>
        <button class="rfp-mic" id="rfp-mic-btn" title="Voice control OFF. Clique pour activer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          <span id="rfp-mic-state">Off</span>
        </button>
      </div>
      <div class="rfp-actions">
        <button class="rfp-act" id="rfp-panel-btn" title="Ouvrir / fermer le panneau latéral">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>
        </button>
        <button class="rfp-act rfp-scroll" id="rfp-scroll-btn" title="Lancer / Arrêter le défilement automatique">
          <svg id="rfp-scroll-play" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><polygon points="5,3 19,12 5,21"/></svg>
          <svg id="rfp-scroll-stop" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
        <button class="rfp-act" id="rfp-repertoire-btn" title="Répertoire">📖</button>
      </div>
      <div class="rfp-chips">
        <span class="rfp-chip rfp-chip-wide">Flux: <b id="rfp-flux">Silencieux</b></span>
        <span class="rfp-chip">Vitesse: <b id="ug-voice-speed">1</b></span>
        <span class="rfp-chip">Capo: <b id="rfp-capo">–</b></span>
        <span class="rfp-chip">Trans: <b id="rfp-trans">–</b></span>
        <span class="rfp-chip">Ton: <b id="rfp-key">–</b></span>
      </div>
    `;
    document.body.appendChild(pill);

    // Transcript intégré au pill (une ligne, sous les puces)
    const transcript = document.createElement('div');
    transcript.className = 'rfp-transcript';
    transcript.innerHTML = `
      <span class="rfp-transcript-label">Micro :</span>
      <span id="rfp-transcript-text">—</span>
    `;
    pill.appendChild(transcript);
    const transcriptText = transcript.querySelector('#rfp-transcript-text');

    // --- Position (persistée) -------------------------------------------------
    function restorePosition() {
      try {
        window.RockstarCore.safeStorageGet([POS_KEY], (res) => {
          const pos = res && res[POS_KEY];
          if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
            pill.style.left = pos.left + 'px';
            pill.style.top = pos.top + 'px';
            pill.style.right = 'auto';
          }
        });
      } catch (e) { /* position par défaut */ }
    }
    restorePosition();

    // --- Déplacement par la poignée -------------------------------------------
    const handle = pill.querySelector('#rfp-handle');
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const rect = pill.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      // Positionner en left/top uniquement : garder bottom défini en même
      // temps étirerait le pill entre les deux ancres.
      pill.style.right = 'auto';
      pill.style.bottom = 'auto';
      pill.style.left = rect.left + 'px';
      pill.style.top = rect.top + 'px';
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const left = Math.max(0, Math.min(window.innerWidth - pill.offsetWidth, e.clientX - drag.dx));
      const top = Math.max(0, Math.min(window.innerHeight - pill.offsetHeight, e.clientY - drag.dy));
      pill.style.left = left + 'px';
      pill.style.top = top + 'px';
    });
    handle.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      const pos = { left: parseInt(pill.style.left, 10) || 0, top: parseInt(pill.style.top, 10) || 0 };
      window.RockstarCore.safeStorageSet({ [POS_KEY]: pos });
    });

    // --- Bouton micro (même logique que l'ancien #ug-voice-btn) ----------------
    const micBtn = pill.querySelector('#rfp-mic-btn');
    const micState = pill.querySelector('#rfp-mic-state');
    micBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.RockstarCore.isListening && !window.RockstarCore.isAwake) {
        if (window.RockstarCore.wakeUp) {
          window.RockstarCore.wakeUp(15000, true);
        }
      } else if (window.RockstarCore.startListening) {
        window.RockstarCore.startListening();
      }
    });

    function updateMicVisual() {
      const core = window.RockstarCore;
      const isAwake = core.isListening && core.isAwake;
      micBtn.classList.toggle('awake', isAwake);
      if (isAwake) {
        micState.textContent = 'ON';
        micBtn.classList.add('active');
      } else if (core.isListening) {
        micState.textContent = 'Écoute';
        micBtn.classList.remove('active');
      } else {
        micState.textContent = 'Off';
        micBtn.classList.remove('active');
      }
    }
    window.RockstarCore.onListeningChanged(updateMicVisual);
    window.RockstarCore.onAwakeChanged(updateMicVisual);
    updateMicVisual();

    // --- Barre de progression du réveil (cooldown) sur le bouton micro ----------
    // Même mécanique que l'ancien bouton : --awake-progress alimente le
    // dégradé vert quand Roddy est réveillé ("À l'écoute" temporaire).
    let awakeProgressAnimFrame = null;
    function updateAwakeProgress() {
      const awakeUntil = window.RockstarCore.awakeUntil;
      const awakeDuration = window.RockstarCore.awakeDuration;
      if (awakeUntil && awakeDuration) {
        const remaining = awakeUntil - Date.now();
        if (remaining > 0) {
          const pct = Math.max(0, Math.min(100, (remaining / awakeDuration) * 100));
          micBtn.style.setProperty('--awake-progress', pct + '%');
          awakeProgressAnimFrame = requestAnimationFrame(updateAwakeProgress);
          return;
        }
      }
      micBtn.style.setProperty('--awake-progress', '0%');
    }
    window.RockstarCore.onAwakeChanged((isAwake) => {
      if (awakeProgressAnimFrame) {
        cancelAnimationFrame(awakeProgressAnimFrame);
        awakeProgressAnimFrame = null;
      }
      if (isAwake) {
        awakeProgressAnimFrame = requestAnimationFrame(updateAwakeProgress);
      } else {
        micBtn.style.setProperty('--awake-progress', '0%');
      }
    });

    // --- Boutons panneau / défilement / répertoire -------------------------------
    const scrollBtn = pill.querySelector('#rfp-scroll-btn');
    const scrollPlay = scrollBtn.querySelector('#rfp-scroll-play');
    const scrollStop = scrollBtn.querySelector('#rfp-scroll-stop');

    function updateScrollVisual() {
      const scrolling = Boolean(window.RockstarCore.isScrolling);
      scrollPlay.style.display = scrolling ? 'none' : 'block';
      scrollStop.style.display = scrolling ? 'block' : 'none';
      scrollBtn.classList.toggle('active', scrolling);
    }
    window.addEventListener('rockstar-scroll-state-changed', updateScrollVisual);
    // Filet de sécurité si l'événement a été manqué (ex. ouverture du pill pendant le scroll)
    setInterval(updateScrollVisual, 1000);
    updateScrollVisual();

    scrollBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.RockstarCore.isScrolling) {
        if (window.RockstarCore.stopScrolling) window.RockstarCore.stopScrolling();
      } else if (window.RockstarCore.handleCommand) {
        window.RockstarCore.handleCommand('défile');
      }
      setTimeout(updateScrollVisual, 100);
    });

    // Ouvre le panneau ; s'il est déjà ouvert, le panneau se ferme lui-même
    // (message rockstar:panel-toggle -> window.close()).
    pill.querySelector('#rfp-panel-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'rockstar:open-panel', kind: 'toggle' });
      }
    });

    // --- Bouton répertoire ------------------------------------------------------
    pill.querySelector('#rfp-repertoire-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.RockstarCore.toggleDrawer) {
        window.RockstarCore.toggleDrawer();
      }
    });

    // --- Puces morceau (Capo / Trans / Ton) -------------------------------------
    function updateSongChips(song) {
      const capoEl = pill.querySelector('#rfp-capo');
      const transEl = pill.querySelector('#rfp-trans');
      const keyEl = pill.querySelector('#rfp-key');
      if (!capoEl) return;
      if (song && (song.capo !== undefined || song.transpose !== undefined || song.key)) {
        capoEl.textContent = song.capo || 0;
        transEl.textContent = song.transpose || 0;
        keyEl.textContent = song.key || '–';
      }
    }
    updateSongChips(window.RockstarCore.getCurrentSong && window.RockstarCore.getCurrentSong());
    window.addEventListener('rockstar-song-changed', (e) => updateSongChips(e.detail && e.detail.song));

    // --- Transcript du flux micro -------------------------------------------------
    // voiceEngine émet 'rockstar-voice-raw' avec le texte en cours (interim).
    window.addEventListener('rockstar-voice-raw', (e) => {
      const text = e.detail && e.detail.text;
      if (typeof text === 'string' && text.trim()) {
        transcriptText.textContent = text;
        transcript.classList.add('has-content');
      }
    });
    window.addEventListener('rockstar-voice-command', (e) => {
      const detail = e.detail || {};
      transcriptText.textContent = detail.success ? '✓ ' + detail.action : '✗ ' + (detail.action || 'non reconnu');
      transcript.classList.add('has-content');
    });

    // Le feedback des commandes arrive ici (au lieu des toasts de la barre)
    window.RockstarCore.showFeedback = (text, isSuccess) => {
      transcriptText.textContent = text;
      transcript.classList.add('has-content');
      transcript.classList.toggle('error', isSuccess === false);
      clearTimeout(window.RockstarCore.showFeedback._t);
      window.RockstarCore.showFeedback._t = setTimeout(() => {
        transcript.classList.remove('error');
      }, 4000);
    };
  }

  window.RockstarCore.registerInit(initFloatingButton);
})();