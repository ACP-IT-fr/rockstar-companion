// widgets/pianoKeyboard.js
(function() {
  if (!window.RockstarCore) return;

  let pianoWidgetEl = null;
  let mountContainer = null;
  let pianoActive = false;
  let micActive = false;
  let renderLoopId = null;

  // Sound Engine & Dynamic Octave settings
  let activeKbdOctave = 4; // Default C4 (Octave 4)
  let selectedInstrument = 'piano'; // 'piano', 'sine', 'organ'
  let targetNoteInfo = null; // { note: 'A', octave: 4, midi: 69, freq: 440 }
  let sungNoteInfo = null;   // { note: 'A', octave: 4, midi: 69, freq: 442, cents: 8 }

  // Web Audio Nodes & Polyphony
  let masterGainNode = null;
  let masterCompressorNode = null;
  const activeVoicesMap = new Map(); // MIDI -> { oscs: [], gainNode: GainNode, targetNoteInfo: {} }
  const pressedComputerKeys = new Set(); // e.code or e.key

  // Pitch analysis variables
  const sampleBuf = new Float32Array(2048);
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTE_NAMES_FR = ["Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

  // Voice note mapping dictionary (AZERTY / QWERTY compatible)
  const KBD_MAP = {
    'KeyQ': { offset: 0, badge: 'Q' },
    'KeyA': { offset: 0, badge: 'Q' },
    'KeyS': { offset: 2, badge: 'S' },
    'KeyD': { offset: 4, badge: 'D' },
    'KeyF': { offset: 5, badge: 'F' },
    'KeyG': { offset: 7, badge: 'G' },
    'KeyH': { offset: 9, badge: 'H' },
    'KeyJ': { offset: 11, badge: 'J' },
    'KeyK': { offset: 12, badge: 'K' },

    'KeyZ': { offset: 1, badge: 'Z' },
    'KeyW': { offset: 1, badge: 'Z' },
    'KeyE': { offset: 3, badge: 'E' },
    'KeyT': { offset: 6, badge: 'T' },
    'KeyY': { offset: 8, badge: 'Y' },
    'KeyU': { offset: 10, badge: 'U' }
  };

  const OFFSET_BADGES = {
    0: 'Q', 1: 'Z', 2: 'S', 3: 'E', 4: 'D', 5: 'F', 6: 'T',
    7: 'G', 8: 'Y', 9: 'H', 10: 'U', 11: 'J', 12: 'K'
  };

  // Helper pitch math
  function getMidi(noteName, octave) {
    const index = NOTE_NAMES.indexOf(noteName);
    if (index === -1) return 60; // Fallback C4
    return 12 * (octave + 1) + index;
  }

  function getFrequency(noteName, octave) {
    const midi = getMidi(noteName, octave);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiToNote(midi) {
    const roundedMidi = Math.round(midi);
    const index = ((roundedMidi % 12) + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;
    const freq = 440 * Math.pow(2, (roundedMidi - 69) / 12);
    return {
      note: NOTE_NAMES[index],
      noteFr: NOTE_NAMES_FR[index],
      octave: octave,
      midi: roundedMidi,
      freq: freq
    };
  }

  // ----------------------------------------------------
  // Audio Pipeline with Compressor/Limiter Anti-Clipping
  // ----------------------------------------------------
  function getMasterAudioOutput() {
    const audioContext = window.RockstarCore.getAudioContext();
    if (!audioContext) return null;

    if (!masterCompressorNode) {
      masterCompressorNode = audioContext.createDynamicsCompressor();
      masterCompressorNode.threshold.setValueAtTime(-18, audioContext.currentTime);
      masterCompressorNode.knee.setValueAtTime(12, audioContext.currentTime);
      masterCompressorNode.ratio.setValueAtTime(8, audioContext.currentTime);
      masterCompressorNode.attack.setValueAtTime(0.003, audioContext.currentTime);
      masterCompressorNode.release.setValueAtTime(0.15, audioContext.currentTime);

      masterGainNode = audioContext.createGain();
      masterGainNode.gain.setValueAtTime(0.4, audioContext.currentTime); // Headroom

      masterGainNode.connect(masterCompressorNode);
      masterCompressorNode.connect(audioContext.destination);
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    return masterGainNode;
  }

  // Polyphonic Voice Start
  function startNoteVoice(midi, freq, noteName, octave) {
    const audioOutput = getMasterAudioOutput();
    const audioContext = window.RockstarCore.getAudioContext();
    if (!audioOutput || !audioContext) return;

    if (activeVoicesMap.has(midi)) {
      stopNoteVoice(midi, true);
    }

    const now = audioContext.currentTime;
    const oscs = [];
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    if (selectedInstrument === 'piano') {
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * 3.5, 3200), now);
      filter.Q.setValueAtTime(1.2, now);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(0.35, now + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.20, now + 0.3);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioOutput);

      osc1.start(now);
      osc2.start(now);
      oscs.push(osc1, osc2);
    } else if (selectedInstrument === 'organ') {
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();

      osc1.type = 'square';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 1.002, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(0.20, now + 0.015);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioOutput);

      osc1.start(now);
      osc2.start(now);
      oscs.push(osc1, osc2);
    } else {
      const osc = audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(0.30, now + 0.01);

      osc.connect(gainNode);
      gainNode.connect(audioOutput);

      osc.start(now);
      oscs.push(osc);
    }

    const index = NOTE_NAMES.indexOf(noteName);
    targetNoteInfo = {
      note: noteName,
      noteFr: NOTE_NAMES_FR[index],
      octave: octave,
      midi: midi,
      freq: freq
    };

    activeVoicesMap.set(midi, { oscs, gainNode, targetNoteInfo });

    updateUIBadgesAndGauge();
    updateKeyHighlights();
  }

  // Polyphonic Voice Release
  function stopNoteVoice(midi, immediate = false) {
    if (!activeVoicesMap.has(midi)) return;
    const voice = activeVoicesMap.get(midi);
    activeVoicesMap.delete(midi);

    const audioContext = window.RockstarCore.getAudioContext();
    if (!audioContext || !voice) return;

    const now = audioContext.currentTime;
    const releaseTime = immediate ? 0.02 : 0.25;

    try {
      voice.gainNode.gain.cancelScheduledValues(now);
      voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value), now);
      voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);

      setTimeout(() => {
        voice.oscs.forEach(osc => {
          try { osc.stop(); osc.disconnect(); } catch (e) {}
        });
        try { voice.gainNode.disconnect(); } catch (e) {}
      }, releaseTime * 1000 + 50);
    } catch (e) {
      voice.oscs.forEach(osc => {
        try { osc.stop(); osc.disconnect(); } catch (e) {}
      });
    }

    updateKeyHighlights();
  }

  // ----------------------------------------------------
  // Autocorrelation Pitch Detection for Vocal Mic Input
  // ----------------------------------------------------
  function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
      let val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.015) return -1; // Silence threshold

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] = c[i] + buf[j] * buf[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  function startPitchAnalysisLoop() {
    if (renderLoopId) cancelAnimationFrame(renderLoopId);

    const updateLoop = () => {
      if (!pianoActive || !micActive) {
        sungNoteInfo = null;
        updateUIBadgesAndGauge();
        updateKeyHighlights();
        return;
      }

      const audioContext = window.RockstarCore.getAudioContext();
      const analyser = window.RockstarCore.getAnalyser();

      if (analyser && audioContext) {
        analyser.getFloatTimeDomainData(sampleBuf);
        const pitch = autoCorrelate(sampleBuf, audioContext.sampleRate);

        if (pitch !== -1 && pitch >= 60 && pitch <= 1500) {
          const exactMidi = 69 + 12 * Math.log2(pitch / 440);
          const roundedMidi = Math.round(exactMidi);
          const cents = Math.round(100 * (exactMidi - roundedMidi));
          const noteInfo = midiToNote(roundedMidi);
          noteInfo.sungFreq = pitch;
          noteInfo.cents = cents;

          sungNoteInfo = noteInfo;
        } else {
          sungNoteInfo = null;
        }
      } else {
        sungNoteInfo = null;
      }

      updateUIBadgesAndGauge();
      updateKeyHighlights();
      renderLoopId = requestAnimationFrame(updateLoop);
    };

    renderLoopId = requestAnimationFrame(updateLoop);
  }

  // ----------------------------------------------------
  // Modular Mounting & DOM Construction
  // ----------------------------------------------------
  function createPianoDOM() {
    if (pianoWidgetEl) return pianoWidgetEl;

    pianoWidgetEl = document.createElement('div');
    pianoWidgetEl.id = 'rockstar-piano-widget';
    pianoWidgetEl.className = 'rockstar-piano-widget';

    pianoWidgetEl.innerHTML = `
      <div class="piano-header">
        <div class="piano-title">
          <span class="piano-icon">🎹</span>
          <span class="piano-title-text">Piano Concert 88 Touches</span>
        </div>

        <div class="piano-octave-jumper">
          <span class="jumper-label">Saut :</span>
          <button class="piano-jump-btn" data-octave="0">A0</button>
          <button class="piano-jump-btn" data-octave="2">C2</button>
          <button class="piano-jump-btn active" data-octave="4" id="jump-btn-c4">C4 (Centre)</button>
          <button class="piano-jump-btn" data-octave="6">C6</button>
          <button class="piano-jump-btn" data-octave="8">C8</button>
        </div>

        <div class="piano-controls">
          <label class="piano-inst-label">
            <span>Son :</span>
            <select id="piano-inst-select" class="piano-select">
              <option value="piano" selected>Piano Acoustique</option>
              <option value="sine">Onde Sinusoïdale</option>
              <option value="organ">Orgue / Synthé</option>
            </select>
          </label>

          <button id="piano-mic-toggle" class="piano-btn-mic" title="Analyse vocale en direct (Micro)">
            🎙️ Chant
          </button>
          <button id="piano-close-btn" class="piano-btn-close" title="Fermer">✕</button>
        </div>
      </div>

      <div class="piano-scroll-outer">
        <div class="piano-keyboard-container" id="piano-keys-wrapper">
          <!-- 88 Keys Rendered Dynamically -->
        </div>
      </div>

      <div class="piano-status-panel">
        <div class="piano-info-card target-card">
          <div class="card-label">Note Jouée</div>
          <div class="card-value" id="piano-target-note-val">-</div>
          <div class="card-sub" id="piano-target-freq-val">- Hz</div>
        </div>

        <div class="piano-cents-container">
          <div class="cents-header">
            <span>Écart Vocal (Cents)</span>
            <span id="piano-cents-text" class="cents-val-text">0 cents</span>
          </div>
          <div class="cents-bar-wrapper">
            <div class="cents-bar-center"></div>
            <div class="cents-bar-indicator" id="piano-cents-indicator"></div>
          </div>
        </div>

        <div class="piano-info-card sung-card">
          <div class="card-label">Note Chantée (Micro)</div>
          <div class="card-value" id="piano-sung-note-val">-</div>
          <div class="card-sub" id="piano-sung-freq-val">- Hz</div>
        </div>
      </div>
    `;

    // Attach event listeners
    const instSelect = pianoWidgetEl.querySelector('#piano-inst-select');
    instSelect.addEventListener('change', (e) => {
      selectedInstrument = e.target.value;
    });

    const micToggleBtn = pianoWidgetEl.querySelector('#piano-mic-toggle');
    micToggleBtn.addEventListener('click', () => {
      toggleMicAnalysis();
    });

    const closeBtn = pianoWidgetEl.querySelector('#piano-close-btn');
    closeBtn.addEventListener('click', () => {
      hidePiano();
    });

    // Octave Jump Buttons
    const jumpBtns = pianoWidgetEl.querySelectorAll('.piano-jump-btn');
    jumpBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetOctave = parseInt(btn.dataset.octave, 10);
        setActiveOctave(targetOctave, true);
      });
    });

    render88Keys();

    const wrapper = pianoWidgetEl.querySelector('#piano-keys-wrapper');
    setupKeyboardScrollHandlers(wrapper);

    return pianoWidgetEl;
  }

  // Update Active Octave & Relocate Visual Hints
  function setActiveOctave(newOctave, scroll = false) {
    activeKbdOctave = Math.max(0, Math.min(8, newOctave));

    if (pianoWidgetEl) {
      const jumpBtns = pianoWidgetEl.querySelectorAll('.piano-jump-btn');
      jumpBtns.forEach(b => {
        const oct = parseInt(b.dataset.octave, 10);
        b.classList.toggle('active', oct === activeKbdOctave);
      });

      // Update Key Hints to current active octave
      updateVisualKeyHints();
    }

    if (scroll) {
      const startMidi = 12 * (activeKbdOctave + 1);
      scrollToOctave(Math.max(21, Math.min(108, startMidi)));
    }
  }

  function updateVisualKeyHints() {
    if (!pianoWidgetEl) return;
    const wrapper = pianoWidgetEl.querySelector('#piano-keys-wrapper');
    if (!wrapper) return;

    // Remove existing hints
    wrapper.querySelectorAll('.key-kbd-hint').forEach(el => el.remove());

    // Render hints for the active octave (activeKbdOctave)
    const baseMidi = 12 * (activeKbdOctave + 1);
    for (let offset = 0; offset <= 12; offset++) {
      const midi = baseMidi + offset;
      if (midi >= 21 && midi <= 108 && OFFSET_BADGES[offset]) {
        const keyEl = wrapper.querySelector(`.piano-key[data-midi="${midi}"]`);
        if (keyEl) {
          const hint = document.createElement('div');
          hint.className = 'key-kbd-hint';
          hint.textContent = OFFSET_BADGES[offset];
          keyEl.appendChild(hint);
        }
      }
    }
  }

  // Render Full 88-Key Concert Keyboard (A0 to C8: MIDI 21 to 108)
  function render88Keys() {
    if (!pianoWidgetEl) return;
    const wrapper = pianoWidgetEl.querySelector('#piano-keys-wrapper');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    for (let midi = 21; midi <= 108; midi++) {
      const k = midiToNote(midi);
      const isWhite = !k.note.includes('#');
      const keyEl = document.createElement('div');
      keyEl.className = `piano-key ${isWhite ? 'white-key' : 'black-key'}`;
      keyEl.dataset.note = k.note;
      keyEl.dataset.octave = k.octave;
      keyEl.dataset.midi = midi;
      keyEl.dataset.freq = Math.round(k.freq);

      // Add visual Octave Marker on C keys
      let badgeHtml = '';
      if (k.note === 'C') {
        const isMiddleC = (midi === 60);
        badgeHtml = `<div class="key-octave-badge ${isMiddleC ? 'middle-c' : ''}">${isMiddleC ? 'C4' : `C${k.octave}`}</div>`;
      }

      keyEl.innerHTML = `
        ${badgeHtml}
        <div class="key-label">
          <span class="key-note">${k.noteFr}${k.octave}</span>
          <span class="key-freq">${Math.round(k.freq)}Hz</span>
        </div>
      `;

      let startX = 0;
      let startY = 0;

      keyEl.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        startNoteVoice(midi, k.freq, k.note, k.octave);
      });

      keyEl.addEventListener('mouseup', () => {
        stopNoteVoice(midi);
      });

      keyEl.addEventListener('mouseleave', () => {
        stopNoteVoice(midi);
      });

      keyEl.addEventListener('touchstart', (e) => {
        startNoteVoice(midi, k.freq, k.note, k.octave);
      }, { passive: true });

      keyEl.addEventListener('touchend', () => {
        stopNoteVoice(midi);
      });

      wrapper.appendChild(keyEl);
    }

    updateVisualKeyHints();
  }

  // Setup Mouse Wheel (Vertical to Horizontal) & Mouse Drag Scrolling
  function setupKeyboardScrollHandlers(wrapper) {
    if (!wrapper) return;

    wrapper.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        wrapper.scrollLeft += e.deltaY * 1.2;
        e.preventDefault();
      }
      detectActiveOctaveOnScroll(wrapper);
    }, { passive: false });

    wrapper.addEventListener('scroll', () => {
      detectActiveOctaveOnScroll(wrapper);
    }, { passive: true });

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    wrapper.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('piano-key') || e.target.closest('.piano-key')) {
        return; // Don't initiate drag if clicking directly on a key
      }
      isDown = true;
      wrapper.classList.add('grabbing');
      startX = e.pageX - wrapper.offsetLeft;
      scrollLeft = wrapper.scrollLeft;
    });

    wrapper.addEventListener('mouseleave', () => {
      isDown = false;
      wrapper.classList.remove('grabbing');
    });

    wrapper.addEventListener('mouseup', () => {
      isDown = false;
      wrapper.classList.remove('grabbing');
    });

    wrapper.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrapper.offsetLeft;
      const walk = (x - startX) * 1.5;
      wrapper.scrollLeft = scrollLeft - walk;
    });
  }

  let scrollOctaveDebounce = null;
  function detectActiveOctaveOnScroll(wrapper) {
    if (scrollOctaveDebounce) return;
    scrollOctaveDebounce = setTimeout(() => {
      scrollOctaveDebounce = null;
      if (!wrapper) return;
      const centerPos = wrapper.scrollLeft + wrapper.clientWidth / 2;
      const keys = wrapper.querySelectorAll('.piano-key');
      let minDiff = Infinity;
      let centerMidi = 60;

      keys.forEach(k => {
        const kCenter = k.offsetLeft + k.offsetWidth / 2;
        const diff = Math.abs(kCenter - centerPos);
        if (diff < minDiff) {
          minDiff = diff;
          centerMidi = parseInt(k.dataset.midi, 10);
        }
      });

      const detectedOctave = Math.floor(centerMidi / 12) - 1;
      if (detectedOctave >= 0 && detectedOctave <= 8 && detectedOctave !== activeKbdOctave) {
        setActiveOctave(detectedOctave, false);
      }
    }, 100);
  }

  function scrollToOctave(midiTarget) {
    if (!pianoWidgetEl) return;
    const wrapper = pianoWidgetEl.querySelector('#piano-keys-wrapper');
    if (!wrapper) return;

    const targetKey = wrapper.querySelector(`.piano-key[data-midi="${midiTarget}"]`);
    if (targetKey) {
      const wrapperWidth = wrapper.clientWidth;
      const keyLeft = targetKey.offsetLeft;
      const keyWidth = targetKey.offsetWidth;
      wrapper.scrollTo({
        left: keyLeft - (wrapperWidth / 2) + (keyWidth / 2),
        behavior: 'smooth'
      });
    }
  }

  let lastHighlightedTargetMidi = null;
  let lastHighlightedSungMidi = null;

  function updateKeyHighlights() {
    if (!pianoWidgetEl) return;

    const activeMidis = new Set(activeVoicesMap.keys());
    if (targetNoteInfo && targetNoteInfo.midi) {
      activeMidis.add(targetNoteInfo.midi);
    }
    const newSungMidi = sungNoteInfo ? sungNoteInfo.midi : null;

    const wrapper = pianoWidgetEl.querySelector('#piano-keys-wrapper');
    if (!wrapper) return;

    // Highlight all playing active voices
    const keys = wrapper.querySelectorAll('.piano-key');
    keys.forEach(key => {
      const midi = parseInt(key.dataset.midi, 10);
      const isTarget = activeMidis.has(midi);
      const isSung = (newSungMidi === midi);

      key.classList.toggle('target-active', isTarget);
      key.classList.toggle('sung-active', isSung);
    });
  }

  function updateUIBadgesAndGauge() {
    if (!pianoWidgetEl) return;

    const targetNoteEl = pianoWidgetEl.querySelector('#piano-target-note-val');
    const targetFreqEl = pianoWidgetEl.querySelector('#piano-target-freq-val');
    if (targetNoteInfo) {
      targetNoteEl.textContent = `${targetNoteInfo.noteFr}${targetNoteInfo.octave} (${targetNoteInfo.note}${targetNoteInfo.octave})`;
      targetFreqEl.textContent = `${Math.round(targetNoteInfo.freq)} Hz`;
    } else {
      targetNoteEl.textContent = '-';
      targetFreqEl.textContent = '- Hz';
    }

    const sungNoteEl = pianoWidgetEl.querySelector('#piano-sung-note-val');
    const sungFreqEl = pianoWidgetEl.querySelector('#piano-sung-freq-val');
    const centsTextEl = pianoWidgetEl.querySelector('#piano-cents-text');
    const centsIndicator = pianoWidgetEl.querySelector('#piano-cents-indicator');

    if (sungNoteInfo) {
      sungNoteEl.textContent = `${sungNoteInfo.noteFr}${sungNoteInfo.octave} (${sungNoteInfo.note}${sungNoteInfo.octave})`;
      sungFreqEl.textContent = `${Math.round(sungNoteInfo.sungFreq)} Hz`;

      let centsDiff = sungNoteInfo.cents;
      if (targetNoteInfo) {
        const centsFromTarget = 1200 * Math.log2(sungNoteInfo.sungFreq / targetNoteInfo.freq);
        centsDiff = Math.max(-50, Math.min(50, Math.round(centsFromTarget)));
      }

      centsTextEl.textContent = `${centsDiff > 0 ? '+' : ''}${centsDiff} cents`;

      const percent = Math.max(0, Math.min(100, 50 + (centsDiff / 50) * 50));
      centsIndicator.style.left = `${percent}%`;

      const absCents = Math.abs(centsDiff);
      if (absCents <= 12) {
        centsIndicator.style.backgroundColor = '#10b981';
      } else if (absCents <= 28) {
        centsIndicator.style.backgroundColor = '#f59e0b';
      } else {
        centsIndicator.style.backgroundColor = '#ef4444';
      }
    } else {
      sungNoteEl.textContent = '-';
      sungFreqEl.textContent = '- Hz';
      centsTextEl.textContent = '0 cents';
      centsIndicator.style.left = '50%';
      centsIndicator.style.backgroundColor = '#6b7280';
    }
  }

  function toggleMicAnalysis() {
    const micToggleBtn = pianoWidgetEl ? pianoWidgetEl.querySelector('#piano-mic-toggle') : null;
    if (micActive) {
      micActive = false;
      if (micToggleBtn) {
        micToggleBtn.classList.remove('active');
        micToggleBtn.textContent = '🎙️ Chant';
      }
    } else {
      micActive = true;
      if (micToggleBtn) {
        micToggleBtn.classList.add('active');
        micToggleBtn.textContent = '🎙️ Chant Actif';
      }

      const audioContext = window.RockstarCore.getAudioContext();
      let analyser = window.RockstarCore.getAnalyser();

      if (!analyser) {
        const newAnalyser = audioContext.createAnalyser();
        newAnalyser.fftSize = 16384;
        window.RockstarCore.setAnalyser(newAnalyser);
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(newAnalyser);
          startPitchAnalysisLoop();
        }).catch(err => {
          console.error("[RockstarPiano] Microphone access denied", err);
          micActive = false;
          if (micToggleBtn) {
            micToggleBtn.classList.remove('active');
            micToggleBtn.textContent = '🎙️ Chant';
          }
        });
      } else {
        startPitchAnalysisLoop();
      }
    }
  }

  function checkSharedMicAutoSync() {
    const existingAnalyser = window.RockstarCore.getAnalyser();
    const micToggleBtn = pianoWidgetEl ? pianoWidgetEl.querySelector('#piano-mic-toggle') : null;
    if (existingAnalyser && !micActive) {
      micActive = true;
      if (micToggleBtn) {
        micToggleBtn.classList.add('active');
        micToggleBtn.textContent = '🎙️ Chant Actif';
      }
      startPitchAnalysisLoop();
    }
  }

  // Computer Keyboard Polyphonic Keydown Handler
  function handleKeyDown(e) {
    if (!pianoActive || !pianoWidgetEl || !pianoWidgetEl.classList.contains('visible')) return;

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }

    if (e.repeat) return; // Prevent stutter on key hold

    // Computer key play mapping
    let mapInfo = KBD_MAP[e.code];
    if (!mapInfo) {
      const keyChar = e.key.toLowerCase();
      const charToCode = {
        'q': 'KeyQ', 'a': 'KeyQ',
        'z': 'KeyZ', 'w': 'KeyZ',
        's': 'KeyS', 'e': 'KeyE', 'd': 'KeyD', 'f': 'KeyF',
        't': 'KeyT', 'g': 'KeyG', 'y': 'KeyY', 'h': 'KeyH',
        'u': 'KeyU', 'j': 'KeyJ', 'k': 'KeyK'
      };
      if (charToCode[keyChar]) {
        mapInfo = KBD_MAP[charToCode[keyChar]];
      }
    }

    if (mapInfo) {
      e.preventDefault();
      pressedComputerKeys.add(e.code);
      const baseMidi = 12 * (activeKbdOctave + 1);
      const targetMidi = Math.max(21, Math.min(108, baseMidi + mapInfo.offset));
      const noteObj = midiToNote(targetMidi);
      startNoteVoice(targetMidi, noteObj.freq, noteObj.note, noteObj.octave);
      return;
    }

    // Arrow keys navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveOctave(activeKbdOctave + 1, true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveOctave(activeKbdOctave - 1, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      let currentMidi = targetNoteInfo ? targetNoteInfo.midi : 60;
      e.preventDefault();
      currentMidi = (e.key === 'ArrowLeft') ? Math.max(21, currentMidi - 1) : Math.min(108, currentMidi + 1);
      const noteObj = midiToNote(currentMidi);
      startNoteVoice(currentMidi, noteObj.freq, noteObj.note, noteObj.octave);
      scrollToOctave(currentMidi);
    }
  }

  // Computer Keyboard Keyup Handler
  function handleKeyUp(e) {
    if (!pianoActive || !pianoWidgetEl) return;

    let mapInfo = KBD_MAP[e.code];
    if (!mapInfo) {
      const keyChar = e.key.toLowerCase();
      const charToCode = {
        'q': 'KeyQ', 'a': 'KeyQ',
        'z': 'KeyZ', 'w': 'KeyZ',
        's': 'KeyS', 'e': 'KeyE', 'd': 'KeyD', 'f': 'KeyF',
        't': 'KeyT', 'g': 'KeyG', 'y': 'KeyY', 'h': 'KeyH',
        'u': 'KeyU', 'j': 'KeyJ', 'k': 'KeyK'
      };
      if (charToCode[keyChar]) {
        mapInfo = KBD_MAP[charToCode[keyChar]];
      }
    }

    if (mapInfo) {
      pressedComputerKeys.delete(e.code);
      const baseMidi = 12 * (activeKbdOctave + 1);
      const targetMidi = Math.max(21, Math.min(108, baseMidi + mapInfo.offset));
      stopNoteVoice(targetMidi);
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // ----------------------------------------------------
  // Modular Placement & Visibility Controls
  // ----------------------------------------------------
  function setMountContainer(containerEl) {
    mountContainer = containerEl || window.RockstarCore.getOrCreateFloatingBar() || document.body;
    const dom = createPianoDOM();
    if (dom.parentElement !== mountContainer) {
      mountContainer.appendChild(dom);
    }
  }

  function showPiano() {
    const dom = createPianoDOM();
    if (!dom.parentElement) {
      setMountContainer(mountContainer);
    }
    dom.classList.add('visible');
    pianoActive = true;
    const pianoBtn = document.getElementById('ug-voice-btn-piano');
    if (pianoBtn) pianoBtn.classList.add('active');

    setTimeout(() => {
      setActiveOctave(4, true);
      checkSharedMicAutoSync();
    }, 120);
  }

  function hidePiano() {
    if (pianoWidgetEl) {
      pianoWidgetEl.classList.remove('visible');
    }
    pianoActive = false;
    micActive = false;
    targetNoteInfo = null;
    sungNoteInfo = null;

    // Stop all active voices
    activeVoicesMap.forEach((voice, midi) => {
      stopNoteVoice(midi, true);
    });

    const pianoBtn = document.getElementById('ug-voice-btn-piano');
    if (pianoBtn) pianoBtn.classList.remove('active');
    if (renderLoopId) cancelAnimationFrame(renderLoopId);
    updateUIBadgesAndGauge();
    updateKeyHighlights();
  }

  function togglePiano() {
    if (pianoActive && pianoWidgetEl && pianoWidgetEl.classList.contains('visible')) {
      hidePiano();
    } else {
      showPiano();
    }
  }

  function parseVoiceNote(query) {
    const clean = query.toLowerCase().trim();
    let note = null;
    let octave = activeKbdOctave;

    const octaveMatch = clean.match(/\b([1-7])\b/);
    if (octaveMatch) {
      octave = parseInt(octaveMatch[1], 10);
    }

    for (const [key, valNote] of Object.entries(VOICE_NOTE_MAP)) {
      if (clean.includes(key)) {
        note = valNote;
        break;
      }
    }

    return note ? { note, octave } : null;
  }

  // ----------------------------------------------------
  // Floating Bar Button & Core Hook Registration
  // ----------------------------------------------------
  function appendPianoBtnToFloatingBar(bar) {
    if (!bar) return;
    let pianoBtn = document.getElementById('ug-voice-btn-piano');
    if (!pianoBtn) {
      pianoBtn = document.createElement('button');
      pianoBtn.id = 'ug-voice-btn-piano';
      pianoBtn.className = 'summary-scroll-toggle ug-voice-btn-piano-summary';
      pianoBtn.title = 'Piano Concert 88 Touches';
      pianoBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10"/><path d="M10 4v10"/><path d="M14 4v10"/><path d="M18 4v10"/></svg>`;
      pianoBtn.addEventListener('click', () => {
        togglePiano();
      });
    }

    const summaryBar = document.getElementById('ug-song-summary-bar');
    if (summaryBar) {
      const drawerBtn = summaryBar.querySelector('#ug-drawer-btn');
      const playBtn = summaryBar.querySelector('#summary-scroll-toggle');

      if (drawerBtn && drawerBtn.nextSibling) {
        summaryBar.insertBefore(pianoBtn, drawerBtn.nextSibling);
      } else if (playBtn && playBtn.nextSibling) {
        summaryBar.insertBefore(pianoBtn, playBtn.nextSibling);
      } else {
        summaryBar.insertBefore(pianoBtn, summaryBar.firstChild);
      }
    } else {
      bar.appendChild(pianoBtn);
    }
  }
  window.RockstarCore.appendPianoBtnToFloatingBar = appendPianoBtnToFloatingBar;

  // Register Voice Commands
  if (window.RockstarCore.registerCommand) {
    window.RockstarCore.registerCommand({
      variants: [
        "piano", "clavier", "générateur de notes", "generateur de notes",
        "ouvre piano", "afficher piano", "affiche piano", "montre piano",
        "ferme piano", "masquer piano", "masque piano"
      ],
      description: "Ouvrir ou fermer le piano concert 88 touches",
      action: (cmd) => {
        if (cmd.includes("ferme") || cmd.includes("masque") || cmd.includes("masquer")) {
          hidePiano();
        } else if (cmd.includes("ouvre") || cmd.includes("affiche") || cmd.includes("afficher") || cmd.includes("montre")) {
          showPiano();
        } else {
          togglePiano();
        }
      }
    });

    window.RockstarCore.registerCommand({
      variants: [
        "joue ", "jouer ", "joue un ", "jouer un ", "note "
      ],
      description: "Jouer une note sur le piano (ex: 'joue la 4', 'joue do', 'joue mi')",
      action: (transcript) => {
        const parsed = parseVoiceNote(transcript);
        if (parsed) {
          showPiano();
          const targetMidi = getMidi(parsed.note, parsed.octave);
          setActiveOctave(parsed.octave, true);
          startNoteVoice(targetMidi, getFrequency(parsed.note, parsed.octave), parsed.note, parsed.octave);
          setTimeout(() => stopNoteVoice(targetMidi), 1200);
        }
      }
    });
  }

  // Register Help Commands for floating bar menu
  if (window.RockstarCore.registerHelpCommands) {
    window.RockstarCore.registerHelpCommands([
      { command: "piano", description: "Ouvre le piano concert 88 touches" },
      { command: "joue la 4", description: "Joue la note La4 (440Hz) et défile dessus" }
    ]);
  }

  // Initialize on page load
  function initPianoWidget() {
    setMountContainer(window.RockstarCore.getOrCreateFloatingBar());
  }

  if (window.RockstarCore.registerInitHook) {
    window.RockstarCore.registerInitHook(initPianoWidget);
  } else {
    document.addEventListener('DOMContentLoaded', initPianoWidget);
  }

  // Expose modular API
  window.RockstarCore.pianoWidget = {
    init: initPianoWidget,
    setMountContainer: setMountContainer,
    show: showPiano,
    hide: hidePiano,
    toggle: togglePiano,
    setActiveOctave: setActiveOctave,
    scrollToOctave: scrollToOctave,
    playNote: (note, oct) => {
      const midi = getMidi(note, oct);
      setActiveOctave(oct, true);
      startNoteVoice(midi, getFrequency(note, oct), note, oct);
      setTimeout(() => stopNoteVoice(midi), 1200);
    },
    setInstrument: (inst) => { selectedInstrument = inst; }
  };
})();
