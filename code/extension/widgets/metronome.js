// widgets/metronome.js
(function() {
  if (!window.RockstarCore) return;

  let metronomeContainer = null;
  let metronomePlaying = false;
  let metronomeBpm = 120;
  let metronomeTimeSignature = '4/4';
  let metronomeSoundType = 'wood';
  let metronomeVolume = 0.5; // 0.0 to 1.0
  let metronomeFlashWidget = false;
  let metronomeFlashScreen = false;
  let screenFlashOverlay = null;

  let nextBeatTime = 0.0;
  let currentBeat = 0;
  let metronomeTimer = null;
  const scheduleAheadTime = 0.1; // seconds
  const lookahead = 25.0; // milliseconds

  // Command variants and regexes
  const metronomeStartVariants = ['démarre le métronome', 'demarre le metronome', 'active le métronome', 'active le metronome', 'joue le métronome', 'joue le metronome', 'metronome play', 'metronome start', 'lance le métronome', 'lance le metronome', 'start metronome', 'play metronome'];
  const metronomeStopVariants = ['arrête le métronome', 'arrete le metronome', 'coupe le métronome', 'coupe le metronome', 'stop le métronome', 'stop le metronome', 'metronome stop', 'metronome pause', 'stop metronome', 'pause metronome'];
  const metronomeTempoRegex = /^(?:tempo|métronome tempo|metronome tempo|vitesse du métronome|vitesse du metronome|bpm)\s*(?:à|a|de\s+)?(\d{2,3})$/i;
  const metronomeMeasureRegex = /^(?:mesure|signature|time signature)\s*(4\s*4|4\/4|3\s*4|3\/4|2\s*4|2\/4|6\s*8|6\/8|1\s*4|1\/4|sans\s+accent|pas\s+d'accent|pas\s+d’accent)$/i;
  const metronomeSoundRegex = /^(?:son|bruit|type de son|metronome sound|sound)\s*(bois|wood|digital|numérique|numerique|tambour|drum|batterie|kit)$/i;
  const metronomeVolumeRegex = /^(?:volume|volume du métronome|volume du metronome|metronome volume)\s*(?:à|a|de\s+)?(\d{1,3})%?$/i;
  const metronomeOptWidgetRegex = /^(?:clignote[r]?\s+(?:le\s+)?widget|metronome flash card|flash card|flash widget)$/i;
  const metronomeOptScreenRegex = /^(?:clignote[r]?\s+(?:l'|l’)?écran|clignote[r]?\s+(?:l'|l’)?ecran|metronome flash screen|flash screen)$/i;

  function createScreenFlashOverlay() {
    if (document.getElementById('ug-metronome-screen-overlay') || screenFlashOverlay) return;
    screenFlashOverlay = document.createElement('div');
    screenFlashOverlay.id = 'ug-metronome-screen-overlay';
    document.body.appendChild(screenFlashOverlay);
  }

  function removeScreenFlashOverlay() {
    if (screenFlashOverlay) {
      screenFlashOverlay.remove();
      screenFlashOverlay = null;
    }
  }

  function startMetronome() {
    if (metronomePlaying) return;
    
    const audioContext = window.RockstarCore.getAudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    metronomePlaying = true;
    currentBeat = 0;
    nextBeatTime = audioContext.currentTime + 0.05;
    
    const playBtn = document.getElementById('metronome-play-btn');
    if (playBtn) {
      playBtn.innerText = '⏸';
      playBtn.classList.add('playing');
    }
    
    scheduler();
  }

  function stopMetronome() {
    if (!metronomePlaying) return;
    metronomePlaying = false;
    clearTimeout(metronomeTimer);
    
    const playBtn = document.getElementById('metronome-play-btn');
    if (playBtn) {
      playBtn.innerText = '▶';
      playBtn.classList.remove('playing');
    }
    const led = document.getElementById('metronome-beats');
    if (led) {
      const dots = led.children;
      for (let i = 0; i < dots.length; i++) {
        dots[i].classList.remove('active');
      }
    }
    if (metronomeContainer) {
      metronomeContainer.classList.remove('flash-active', 'flash-accent');
    }
    const overlay = document.getElementById('ug-metronome-screen-overlay');
    if (overlay) {
      overlay.classList.remove('flash-active', 'flash-accent');
    }
  }

  function scheduler() {
    if (!metronomePlaying) return;
    const audioContext = window.RockstarCore.getAudioContext();
    while (nextBeatTime < audioContext.currentTime + scheduleAheadTime) {
      scheduleBeat(currentBeat, nextBeatTime);
      advanceBeat();
    }
    metronomeTimer = setTimeout(scheduler, lookahead);
  }

  function advanceBeat() {
    const beatsPerMeasure = getBeatsPerMeasure();
    const secondsPerBeat = 60.0 / metronomeBpm;
    nextBeatTime += secondsPerBeat;
    
    currentBeat++;
    if (currentBeat >= beatsPerMeasure) {
      currentBeat = 0;
    }
  }

  function getBeatsPerMeasure() {
    switch (metronomeTimeSignature) {
      case '4/4': return 4;
      case '3/4': return 3;
      case '2/4': return 2;
      case '6/8': return 6;
      case '1/4': return 1;
      default: return 4;
    }
  }

  // Un point par temps de la mesure ; le premier (temps accentué) s'allume
  // en rouge, les autres en vert. Reconstruit quand la mesure change.
  function renderBeatDots() {
    const container = document.getElementById('metronome-beats');
    if (!container) return;
    const beats = getBeatsPerMeasure();
    container.innerHTML = '';
    for (let i = 0; i < beats; i++) {
      const dot = document.createElement('span');
      dot.className = 'metronome-beat-dot' + (i === 0 && metronomeTimeSignature !== '1/4' ? ' accent' : '');
      container.appendChild(dot);
    }
  }

  // --- Synthèse des sons ------------------------------------------------------
  // Chaque kit définit deux voix très contrastées (accent = temps fort) : la
  // différence porte à la fois sur la hauteur, le timbre, la durée et le
  // volume, pour être identifiable d'une seule oreille même à bas volume.

  function playBeep(ctx, time, { type, freq, endFreq, gain, attack, duration }) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
    }
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(gain * metronomeVolume, time + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + attack + duration);
    osc.start(time);
    osc.stop(time + attack + duration + 0.05);
  }

  function getNoiseBuffer(ctx) {
    if (!ctx.__rockstarNoiseBuffer) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      ctx.__rockstarNoiseBuffer = buffer;
    }
    return ctx.__rockstarNoiseBuffer;
  }

  // Caisse claire : corps très court + souffle de bruit filtré
  function playSnare(ctx, time) {
    playBeep(ctx, time, { type: 'triangle', freq: 185, gain: 0.9, attack: 0.001, duration: 0.05 });
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gainNode = ctx.createGain();
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(1.1 * metronomeVolume, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    noise.start(time);
    noise.stop(time + 0.1);
  }

  // Grosse caisse : sweep grave rapide
  function playKick(ctx, time) {
    playBeep(ctx, time, { type: 'sine', freq: 160, endFreq: 45, gain: 2.8, attack: 0.002, duration: 0.13 });
  }

  const SOUND_KITS = {
    wood: {
      // Accent : "TOK" aigu, long et fort / temps faible : "tok" grave, bref, doux
      accent: (ctx, time) => playBeep(ctx, time, { type: 'triangle', freq: 1800, endFreq: 650, gain: 2.6, attack: 0.002, duration: 0.05 }),
      weak: (ctx, time) => playBeep(ctx, time, { type: 'triangle', freq: 950, endFreq: 400, gain: 1.4, attack: 0.001, duration: 0.028 })
    },
    digital: {
      // Accent : bip aigu tenu (G5) / temps faible : bip une octave dessous, moitié moins fort
      accent: (ctx, time) => playBeep(ctx, time, { type: 'sine', freq: 1568, gain: 2.2, attack: 0.002, duration: 0.07 }),
      weak: (ctx, time) => playBeep(ctx, time, { type: 'sine', freq: 784, gain: 1.1, attack: 0.001, duration: 0.04 })
    },
    drum: {
      // Accent : tom médium-aigu descend / temps faible : thud grave court
      accent: (ctx, time) => playBeep(ctx, time, { type: 'sine', freq: 320, endFreq: 120, gain: 2.8, attack: 0.002, duration: 0.1 }),
      weak: (ctx, time) => playBeep(ctx, time, { type: 'sine', freq: 150, endFreq: 55, gain: 1.6, attack: 0.002, duration: 0.07 })
    },
    kit: {
      // Batterie : grosse caisse sur les temps accentués, caisse claire sur les autres
      accent: playKick,
      weak: playSnare
    }
  };

  function scheduleBeat(beatIndex, time) {
    const audioContext = window.RockstarCore.getAudioContext();
    if (!audioContext) return;

    const isAccent = (metronomeTimeSignature !== '1/4' && beatIndex === 0);
    const kit = SOUND_KITS[metronomeSoundType] || SOUND_KITS.wood;
    (isAccent ? kit.accent : kit.weak)(audioContext, time);

    const delay = (time - audioContext.currentTime) * 1000;
    setTimeout(() => {
      flashLED(beatIndex, isAccent);
    }, Math.max(0, delay));
  }

  function flashLED(beatIndex, isAccent) {
    // Un point par temps : celui du temps courant s'allume (rouge pour
    // l'accent), les autres s'éteignent — on lit la position dans la mesure.
    const container = document.getElementById('metronome-beats');
    if (container) {
      const dots = container.children;
      for (let i = 0; i < dots.length; i++) {
        dots[i].classList.remove('active');
      }
      const dot = dots[beatIndex];
      if (dot) {
        void dot.offsetWidth; // Force reflow pour relancer la transition
        dot.classList.add('active');
      }
    }

    if (metronomeFlashWidget && metronomeContainer) {
      metronomeContainer.classList.remove('flash-active', 'flash-accent');
      void metronomeContainer.offsetWidth; // Force reflow
      metronomeContainer.classList.add('flash-active');
      if (isAccent) {
        metronomeContainer.classList.add('flash-accent');
      }
      setTimeout(() => {
        if (metronomeContainer) {
          metronomeContainer.classList.remove('flash-active', 'flash-accent');
        }
      }, 80);
    }

    if (metronomeFlashScreen) {
      const overlay = document.getElementById('ug-metronome-screen-overlay');
      if (overlay) {
        overlay.classList.remove('flash-active', 'flash-accent');
        void overlay.offsetWidth; // Force reflow
        overlay.classList.add('flash-active');
        if (isAccent) {
          overlay.classList.add('flash-accent');
        }
        setTimeout(() => {
          if (overlay) {
            overlay.classList.remove('flash-active', 'flash-accent');
          }
        }, 80);
      }
    }
  }

  function setMetronomeBpm(newBpm) {
    metronomeBpm = Math.max(40, Math.min(240, newBpm));
    
    const display = document.getElementById('metronome-bpm-display');
    if (display) display.innerText = `${metronomeBpm} BPM`;
    
    const slider = document.getElementById('metronome-bpm-slider');
    if (slider) slider.value = metronomeBpm;
  }

  function setMetronomeTimeSignature(newSig) {
    let sig = newSig.replace(/\s+/g, '/').toLowerCase();
    if (sig === 'sans/accent' || sig === "pas/d'accent" || sig === "pas/d’accent") {
      sig = '1/4';
    }
    
    if (['4/4', '3/4', '2/4', '6/8', '1/4'].includes(sig)) {
      metronomeTimeSignature = sig;
      const select = document.getElementById('metronome-measure');
      if (select) select.value = sig;
      renderBeatDots();
      return true;
    }
    return false;
  }

  // --- Relais des commandes vocales vers le panneau ---------------------------
  // En mode panneau latéral, le widget ne se monte pas dans la page : sans
  // relais, la voix pilote une instance fantôme (audio sans interface). La
  // commande est alors transmise au panneau via le hub background ; si le
  // panneau est fermé, on retombe sur une exécution locale de secours.
  function shouldRelayToPanel() {
    const core = window.RockstarCore;
    if (!core || core.isExtensionPage) return false;
    if (core.shouldMountInPage && core.shouldMountInPage()) return false;
    return typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
  }

  function registerMetronomeCommand(def) {
    const localHandler = def.handler;
    def.handler = (cmdText, match) => {
      if (shouldRelayToPanel()) {
        try {
          chrome.runtime.sendMessage({ type: 'rockstar:metronome-relay', text: cmdText }, (res) => {
            if (chrome.runtime.lastError) void chrome.runtime.lastError;
            if (!res || !res.relayed) localHandler(cmdText, match); // panneau fermé : secours local
          });
        } catch (e) {
          localHandler(cmdText, match); // contexte d'extension invalide : secours local
        }
        const relayAction = typeof def.relayAction === 'function' ? def.relayAction(cmdText, match) : def.relayAction;
        return { success: true, action: relayAction || 'Commande envoyée au panneau' };
      }
      return localHandler(cmdText, match);
    };
    window.RockstarCore.registerCommand(def);
  }

  // --- Tempo de la chanson courante -------------------------------------------
  // Bouton « ♪ » : applique le tempo enregistré sur la fiche de la chanson
  // affichée. Désactivé tant qu'aucun tempo n'est défini (zéro validation
  // visible, cf. préférences UI invités).
  function getSongTempo() {
    const song = window.RockstarCore.getCurrentSong ? window.RockstarCore.getCurrentSong() : null;
    return song && song.tempo ? song.tempo : 0;
  }

  function updateSongTempoButton() {
    const btn = document.getElementById('metronome-song-tempo-btn');
    if (!btn) return;
    const tempo = getSongTempo();
    btn.disabled = !tempo;
    btn.title = tempo
      ? `Régler le métronome sur le tempo de la chanson (${tempo} BPM)`
      : 'Aucun tempo défini pour cette chanson';
  }

  function applySongTempo() {
    const tempo = getSongTempo();
    if (!tempo) return;
    setMetronomeBpm(tempo);
    const btn = document.getElementById('metronome-song-tempo-btn');
    if (btn) {
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 350);
    }
  }

  // Register commands on RockstarCore
  registerMetronomeCommand({
    name: 'Start Metronome',
    relayAction: 'Démarrage du métronome (panneau)',
    variants: metronomeStartVariants,
    handler: () => {
      startMetronome();
      return { success: true, action: 'Démarrage du métronome' };
    }
  });

  registerMetronomeCommand({
    name: 'Stop Metronome',
    relayAction: 'Arrêt du métronome (panneau)',
    variants: metronomeStopVariants,
    handler: () => {
      stopMetronome();
      return { success: true, action: 'Arrêt du métronome' };
    }
  });

  registerMetronomeCommand({
    name: 'Set Metronome Tempo',
    relayAction: (cmdText, match) => `Tempo réglé sur ${match[1]} BPM (panneau)`,
    regex: metronomeTempoRegex,
    handler: (cmdText, match) => {
      const bpm = parseInt(match[1], 10);
      if (bpm >= 40 && bpm <= 240) {
        setMetronomeBpm(bpm);
        return { success: true, action: `Tempo réglé à ${bpm} BPM` };
      }
      return { success: false, action: `Tempo invalide (40-240): ${bpm}` };
    }
  });

  registerMetronomeCommand({
    name: 'Set Metronome Time Signature',
    relayAction: 'Mesure du métronome réglée (panneau)',
    regex: metronomeMeasureRegex,
    handler: (cmdText, match) => {
      const rawMeasure = match[1];
      const success = setMetronomeTimeSignature(rawMeasure);
      if (success) {
        return { success: true, action: `Mesure réglée sur ${metronomeTimeSignature}` };
      }
      return { success: false, action: `Mesure invalide: ${rawMeasure}` };
    }
  });

  registerMetronomeCommand({
    name: 'Set Metronome Sound Type',
    relayAction: 'Son du métronome réglé (panneau)',
    regex: metronomeSoundRegex,
    handler: (cmdText, match) => {
      const rawSound = match[1].toLowerCase();
      let sound = 'wood';
      if (rawSound === 'digital' || rawSound === 'numérique' || rawSound === 'numerique') {
        sound = 'digital';
      } else if (rawSound === 'tambour' || rawSound === 'drum') {
        sound = 'drum';
      } else if (rawSound === 'batterie' || rawSound === 'kit') {
        sound = 'kit';
      }
      metronomeSoundType = sound;
      const select = document.getElementById('metronome-sound');
      if (select) select.value = sound;
      const displaySound = sound === 'wood' ? 'Bois' : sound === 'digital' ? 'Digital' : sound === 'drum' ? 'Tambour' : 'Batterie';
      return { success: true, action: `Son du métronome réglé sur ${displaySound}` };
    }
  });

  registerMetronomeCommand({
    name: 'Set Metronome Volume',
    relayAction: (cmdText, match) => `Volume du métronome réglé à ${match[1]}% (panneau)`,
    regex: metronomeVolumeRegex,
    handler: (cmdText, match) => {
      const vol = parseInt(match[1], 10);
      if (vol >= 0 && vol <= 100) {
        metronomeVolume = vol / 100;
        const slider = document.getElementById('metronome-volume-slider');
        if (slider) slider.value = vol;
        return { success: true, action: `Volume du métronome réglé à ${vol}%` };
      }
      return { success: false, action: `Volume invalide (0-100): ${vol}` };
    }
  });

  registerMetronomeCommand({
    name: 'Toggle Metronome Flash Widget',
    relayAction: 'Clignotement du widget réglé (panneau)',
    regex: metronomeOptWidgetRegex,
    handler: () => {
      metronomeFlashWidget = !metronomeFlashWidget;
      const btnOpt = document.getElementById('metronome-opt-flash-widget');
      if (btnOpt) btnOpt.classList.toggle('active', metronomeFlashWidget);
      return { success: true, action: `Clignotement du widget : ${metronomeFlashWidget ? 'Activé' : 'Désactivé'}` };
    }
  });

  registerMetronomeCommand({
    name: 'Toggle Metronome Flash Screen',
    relayAction: "Clignotement de l'écran réglé (panneau)",
    regex: metronomeOptScreenRegex,
    handler: () => {
      metronomeFlashScreen = !metronomeFlashScreen;
      const btnOpt = document.getElementById('metronome-opt-flash-screen');
      if (btnOpt) btnOpt.classList.toggle('active', metronomeFlashScreen);
      if (metronomeFlashScreen) {
        createScreenFlashOverlay();
      } else {
        removeScreenFlashOverlay();
      }
      return { success: true, action: `Clignotement de l'écran : ${metronomeFlashScreen ? 'Activé' : 'Désactivé'}` };
    }
  });

  // Help Commands
  window.RockstarCore.registerHelpCommand({ label: "⏱️ Démarrer Métronome", cmd: "démarre le métronome", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "⏱️ Arrêter Métronome", cmd: "arrête le métronome", env: "tab" });

  // Settings sync listener
  window.RockstarCore.onSettingsChanged((settings) => {
    if (settings.inactivityDelay !== undefined) {
      // Metronome uses common settings
    }
  });

  // State changes listener
  window.RockstarCore.onListeningChanged((isListening) => {
    // Keep metronome visible and active even when voice control is off
  });

  // Init metronome UI
  window.RockstarCore.registerInit(() => {
    if (window.RockstarCore.shouldMountInPage && !window.RockstarCore.shouldMountInPage()) return;
    metronomeContainer = document.createElement('div');
    metronomeContainer.id = 'ug-metronome';
    metronomeContainer.innerHTML = `
      <div class="metronome-header">
        <span class="tuner-label">Métronome</span>
        <div class="metronome-options">
          <button id="metronome-song-tempo-btn" class="metronome-opt-btn" title="Régler le tempo sur celui de la chanson" disabled>♪</button>
          <button id="metronome-opt-flash-widget" class="metronome-opt-btn" title="Faire clignoter le widget">🔳</button>
          <button id="metronome-opt-flash-screen" class="metronome-opt-btn" title="Faire clignoter l'écran">🚨</button>
        </div>
      </div>
      <div class="metronome-beats-row">
        <div class="metronome-beats" id="metronome-beats"></div>
      </div>
      <div class="metronome-play-tempo-row">
        <button id="metronome-play-btn" class="metronome-btn">▶</button>
        <div class="metronome-tempo-controls">
          <button id="metronome-minus-btn" class="metronome-btn-small">-</button>
          <span id="metronome-bpm-display" class="metronome-bpm-text">120 BPM</span>
          <button id="metronome-plus-btn" class="metronome-btn-small">+</button>
        </div>
      </div>
      <input type="range" id="metronome-bpm-slider" min="40" max="240" value="120" class="metronome-slider" title="Tempo">
      <div class="metronome-volume-row">
        <span class="volume-icon">🔊</span>
        <input type="range" id="metronome-volume-slider" min="0" max="100" value="50" class="metronome-slider volume-slider" title="Volume">
      </div>
      <div class="metronome-selects-row">
        <select id="metronome-measure" class="metronome-select" title="Mesure">
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="2/4">2/4</option>
          <option value="6/8">6/8</option>
          <option value="1/4">1/4</option>
        </select>
        <select id="metronome-sound" class="metronome-select" title="Type de son">
          <option value="wood">Bois</option>
          <option value="digital">Digital</option>
          <option value="drum">Tambour</option>
          <option value="kit">Batterie</option>
        </select>
      </div>
    `;
    document.body.appendChild(metronomeContainer);

    const metronomePlayBtn = metronomeContainer.querySelector('#metronome-play-btn');
    const metronomeMinusBtn = metronomeContainer.querySelector('#metronome-minus-btn');
    const metronomePlusBtn = metronomeContainer.querySelector('#metronome-plus-btn');
    const metronomeBpmSlider = metronomeContainer.querySelector('#metronome-bpm-slider');
    const metronomeVolumeSlider = metronomeContainer.querySelector('#metronome-volume-slider');
    const metronomeMeasureSelect = metronomeContainer.querySelector('#metronome-measure');
    const metronomeSoundSelect = metronomeContainer.querySelector('#metronome-sound');
    const optFlashWidget = metronomeContainer.querySelector('#metronome-opt-flash-widget');
    const optFlashScreen = metronomeContainer.querySelector('#metronome-opt-flash-screen');
    const songTempoBtn = metronomeContainer.querySelector('#metronome-song-tempo-btn');

    metronomePlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (metronomePlaying) {
        stopMetronome();
      } else {
        startMetronome();
      }
    });

    metronomeMinusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMetronomeBpm(metronomeBpm - 1);
    });

    metronomePlusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMetronomeBpm(metronomeBpm + 1);
    });

    metronomeBpmSlider.addEventListener('input', (e) => {
      setMetronomeBpm(parseInt(e.target.value, 10));
    });

    metronomeVolumeSlider.addEventListener('input', (e) => {
      metronomeVolume = parseInt(e.target.value, 10) / 100;
    });

    metronomeMeasureSelect.addEventListener('change', (e) => {
      metronomeTimeSignature = e.target.value;
      renderBeatDots();
    });

    songTempoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      applySongTempo();
    });

    // Le tempo de la fiche peut changer (chargement d'une chanson, édition,
    // sauvegarde) : le bouton suit sans rechargement.
    window.addEventListener('rockstar-song-changed', updateSongTempoButton);
    window.addEventListener('rockstar-song-updated', updateSongTempoButton);

    metronomeSoundSelect.addEventListener('change', (e) => {
      metronomeSoundType = e.target.value;
    });

    optFlashWidget.addEventListener('click', (e) => {
      e.stopPropagation();
      metronomeFlashWidget = !metronomeFlashWidget;
      optFlashWidget.classList.toggle('active', metronomeFlashWidget);
    });

    optFlashScreen.addEventListener('click', (e) => {
      e.stopPropagation();
      metronomeFlashScreen = !metronomeFlashScreen;
      optFlashScreen.classList.toggle('active', metronomeFlashScreen);
      if (metronomeFlashScreen) {
        createScreenFlashOverlay();
      } else {
        removeScreenFlashOverlay();
      }
    });

    // Synchronisation de l'état initial
    metronomeContainer.classList.add('visible');
    renderBeatDots();
    updateSongTempoButton();
    if (metronomeFlashScreen) {
      createScreenFlashOverlay();
    }
  });

  // Expose play methods
  window.RockstarCore.startMetronome = startMetronome;
  window.RockstarCore.stopMetronome = stopMetronome;
})();
