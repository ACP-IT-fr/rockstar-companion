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
  const metronomeSoundRegex = /^(?:son|bruit|type de son|metronome sound|sound)\s*(bois|wood|digital|numérique|numerique|tambour|drum)$/i;
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
    const led = document.getElementById('metronome-led');
    if (led) {
      led.className = 'metronome-led';
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

  function scheduleBeat(beatIndex, time) {
    const audioContext = window.RockstarCore.getAudioContext();
    if (!audioContext) return;
    
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    const isAccent = (metronomeTimeSignature !== '1/4' && beatIndex === 0);
    
    if (metronomeSoundType === 'digital') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 1200 : 800, time);
      
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(2.0 * metronomeVolume, time + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    } else if (metronomeSoundType === 'drum') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 150 : 100, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.08);
      
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(2.8 * metronomeVolume, time + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    } else {
      // Default: 'wood'
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isAccent ? 1400 : 1000, time);
      osc.frequency.exponentialRampToValueAtTime(100, time + 0.04);
      
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(2.4 * metronomeVolume, time + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    }
    
    osc.start(time);
    osc.stop(time + 0.1);
    
    const delay = (time - audioContext.currentTime) * 1000;
    setTimeout(() => {
      flashLED(beatIndex, isAccent);
    }, Math.max(0, delay));
  }

  function flashLED(beatIndex, isAccent) {
    const led = document.getElementById('metronome-led');
    if (led) {
      led.classList.remove('active', 'accent');
      void led.offsetWidth; // Force reflow
      led.classList.add('active');
      if (isAccent) {
        led.classList.add('accent');
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
      return true;
    }
    return false;
  }

  // Register commands on RockstarCore
  window.RockstarCore.registerCommand({
    name: 'Start Metronome',
    variants: metronomeStartVariants,
    handler: () => {
      startMetronome();
      return { success: true, action: 'Démarrage du métronome' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Stop Metronome',
    variants: metronomeStopVariants,
    handler: () => {
      stopMetronome();
      return { success: true, action: 'Arrêt du métronome' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Set Metronome Tempo',
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

  window.RockstarCore.registerCommand({
    name: 'Set Metronome Time Signature',
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

  window.RockstarCore.registerCommand({
    name: 'Set Metronome Sound Type',
    regex: metronomeSoundRegex,
    handler: (cmdText, match) => {
      const rawSound = match[1].toLowerCase();
      let sound = 'wood';
      if (rawSound === 'digital' || rawSound === 'numérique' || rawSound === 'numerique') {
        sound = 'digital';
      } else if (rawSound === 'tambour' || rawSound === 'drum') {
        sound = 'drum';
      }
      metronomeSoundType = sound;
      const select = document.getElementById('metronome-sound');
      if (select) select.value = sound;
      const displaySound = sound === 'wood' ? 'Bois' : sound === 'digital' ? 'Digital' : 'Tambour';
      return { success: true, action: `Son du métronome réglé sur ${displaySound}` };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Set Metronome Volume',
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

  window.RockstarCore.registerCommand({
    name: 'Toggle Metronome Flash Widget',
    regex: metronomeOptWidgetRegex,
    handler: () => {
      metronomeFlashWidget = !metronomeFlashWidget;
      const btnOpt = document.getElementById('metronome-opt-flash-widget');
      if (btnOpt) btnOpt.classList.toggle('active', metronomeFlashWidget);
      return { success: true, action: `Clignotement du widget : ${metronomeFlashWidget ? 'Activé' : 'Désactivé'}` };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Toggle Metronome Flash Screen',
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
  window.RockstarCore.registerHelpCommand({ label: "⏱️ Démarrer Métronome", cmd: "démarre le métronome" });
  window.RockstarCore.registerHelpCommand({ label: "⏱️ Arrêter Métronome", cmd: "arrête le métronome" });

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
    metronomeContainer = document.createElement('div');
    metronomeContainer.id = 'ug-metronome';
    metronomeContainer.innerHTML = `
      <div class="metronome-header">
        <span class="tuner-label">Métronome</span>
        <div class="metronome-options">
          <button id="metronome-opt-flash-widget" class="metronome-opt-btn" title="Faire clignoter le widget">🔳</button>
          <button id="metronome-opt-flash-screen" class="metronome-opt-btn" title="Faire clignoter l'écran">🚨</button>
        </div>
        <div class="metronome-led" id="metronome-led"></div>
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
    });

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
    if (metronomeFlashScreen) {
      createScreenFlashOverlay();
    }
  });

  // Expose play methods
  window.RockstarCore.startMetronome = startMetronome;
  window.RockstarCore.stopMetronome = stopMetronome;
})();
