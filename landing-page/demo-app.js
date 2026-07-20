// landing-page/demo-app.js — Application de Démo Interactive Vox Roddy

(function() {
  // --- Morceaux de Démonstration ---
  const DEMO_SONGS = {
    rock: {
      title: "Hotel California",
      artist: "Eagles • Rock / Acoustique",
      bpm: 75,
      key: "Bm",
      chords: ["Bm", "F#", "A", "E", "G", "D", "Em"],
      content: `[Intro]
[Bm]  [F#]  [A]  [E]  [G]  [D]  [Em]  [F#]

[Verse 1]
On a [Bm]dark desert highway, [F#]cool wind in my hair
[A]Warm smell of colitas, [E]rising up through the air
[G]Up ahead in the distance, I [D]saw a shimmering light
My [Em]head grew heavy and my sight grew dim, I [F#]had to stop for the night.

[Verse 2]
There she [Bm]stood in the doorway, I [F#]heard the mission bell
And I [A]was thinking to myself, "This could be [E]Heaven or this could be Hell"
Then she [G]lit up a candle and she [D]showed me the way
There were [Em]voices down the corridor, I [F#]thought I heard them say...

[Chorus]
[G]Welcome to the Hotel Cali[D]fornia
Such a [F#]lovely place (such a lovely place), Such a [Bm]lovely face
[G]Plenty of room at the Hotel Cali[D]fornia
Any [Em]time of year (any time of year), You can [F#]find it here...`
    },
    pop: {
      title: "Let It Be",
      artist: "The Beatles • Pop / Piano",
      bpm: 72,
      key: "C",
      chords: ["C", "G", "Am", "F", "Em", "Dm"],
      content: `[Intro]
[C]  [G]  [Am]  [F]  [C]  [G]  [F]  [C]

[Verse 1]
When I [C]find myself in [G]times of trouble, [Am]Mother Mary [F]comes to me
[C]Speaking words of [G]wisdom, let it [F]be [C]
And in my [C]hour of darkness, she is [G]standing right in [Am]front of me [F]
[C]Speaking words of [G]wisdom, let it [F]be [C]

[Chorus]
Let it [Am]be, let it [G]be, let it [F]be, let it [C]be
[C]Whisper words of [G]wisdom, let it [F]be [C]`
    },
    acoustic: {
      title: "Wonderwall",
      artist: "Oasis • Folk / Acoustique",
      bpm: 88,
      key: "Em",
      chords: ["Em7", "G", "Dsus4", "A7sus4", "C", "D"],
      content: `[Intro]
[Em7]  [G]  [Dsus4]  [A7sus4]  (x4)

[Verse 1]
[Em7]Today is gonna be the day that they're [G]gonna throw it back to you
[Dsus4]By now you should've somehow reali[A7sus4]zed what you gotta do
[Em7]I don't believe that [G]anybody [Dsus4]feels the way I [A7sus4]do about you [C]now [D] [A7sus4]

[Chorus]
Because [C]maybe, [Em7]you're gonna be the one that [G]saves me?
And [Em7]after [C]all, [Em7]you're my [G]wonder[Em7]wall...`
    }
  };

  // --- Transposition Logic ---
  const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const CHORD_REGEX = /\[([A-G][b#]?(?:m|maj|min|aug|dim|sus\d?|7|9|11|13)*)\]/g;
  
  let currentSongKey = "rock";
  let currentTransposeSteps = 0;
  let isScrolling = false;
  let scrollSpeed = 1;
  let scrollAnimId = null;

  // --- Audio State ---
  let audioCtx = null;
  let analyser = null;
  let micStream = null;

  // --- Tuner State ---
  let tunerActive = false;
  const STANDARD_STRINGS = [
    { note: "E2", freq: 82.41 },
    { note: "A2", freq: 110.00 },
    { note: "D3", freq: 146.83 },
    { note: "G3", freq: 196.00 },
    { note: "B3", freq: 246.94 },
    { note: "E4", freq: 329.63 }
  ];

  // --- Metronome State ---
  let metroActive = false;
  let metroBpm = 75;
  let metroTimeSig = 4;
  let metroSoundEnabled = true;
  let metroIntervalId = null;
  let metroCurrentBeat = 0;
  let tapTimes = [];

  // --- Piano State ---
  let activePianoNotes = new Set();
  const PIANO_NOTES = [
    { note: "C3", freq: 130.81, isBlack: false },
    { note: "C#3", freq: 138.59, isBlack: true },
    { note: "D3", freq: 146.83, isBlack: false },
    { note: "D#3", freq: 155.56, isBlack: true },
    { note: "E3", freq: 164.81, isBlack: false },
    { note: "F3", freq: 174.61, isBlack: false },
    { note: "F#3", freq: 185.00, isBlack: true },
    { note: "G3", freq: 196.00, isBlack: false },
    { note: "G#3", freq: 207.65, isBlack: true },
    { note: "A3", freq: 220.00, isBlack: false },
    { note: "A#3", freq: 233.08, isBlack: true },
    { note: "B3", freq: 246.94, isBlack: false },
    { note: "C4", freq: 261.63, isBlack: false },
    { note: "C#4", freq: 277.18, isBlack: true },
    { note: "D4", freq: 293.66, isBlack: false },
    { note: "D#4", freq: 311.13, isBlack: true },
    { note: "E4", freq: 329.63, isBlack: false },
    { note: "F4", freq: 349.23, isBlack: false },
    { note: "F#4", freq: 369.99, isBlack: true },
    { note: "G4", freq: 392.00, isBlack: false },
    { note: "G#4", freq: 415.30, isBlack: true },
    { note: "A4", freq: 440.00, isBlack: false },
    { note: "A#4", freq: 466.16, isBlack: true },
    { note: "B4", freq: 493.88, isBlack: false }
  ];

  // --- Voice State ---
  let isListening = false;
  let recognition = null;

  // --- Audio Context Initializer ---
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // --- Init App ---
  document.addEventListener('DOMContentLoaded', () => {
    initSongSelector();
    initTransposeControls();
    initAutoscrollControls();
    initModals();
    initPiano();
    initMetronome();
    initTunerControls();
    initVoiceEngine();
    
    loadSong('rock');
  });

  // Morceau Switcher
  function initSongSelector() {
    document.querySelectorAll('.song-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const songKey = e.target.getAttribute('data-song');
        selectSong(songKey);
      });
    });
  }

  window.selectSong = function(songKey) {
    if (!DEMO_SONGS[songKey]) return;
    currentSongKey = songKey;
    currentTransposeSteps = 0;
    document.getElementById('transpose-val').textContent = '0';

    document.querySelectorAll('.song-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-song') === songKey);
    });

    document.querySelectorAll('.rep-item').forEach(r => {
      r.classList.toggle('active', r.getAttribute('data-song') === songKey);
    });

    loadSong(songKey);
    closeModal('modal-repertoire');
  };

  function loadSong(songKey) {
    const song = DEMO_SONGS[songKey];
    document.getElementById('song-title').textContent = song.title;
    document.getElementById('song-artist').textContent = song.artist;
    metroBpm = song.bpm;
    document.getElementById('metro-bpm-num').textContent = song.bpm;
    document.getElementById('metro-slider').value = song.bpm;

    renderChordsList(song.chords);
    renderTabContent(song.content);
  }

  function renderChordsList(chords) {
    const container = document.getElementById('chords-list');
    container.innerHTML = '';
    chords.forEach(c => {
      const transposed = transposeChord(c, currentTransposeSteps);
      const chip = document.createElement('span');
      chip.className = 'chord-chip';
      chip.textContent = transposed;
      chip.addEventListener('click', () => {
        showToast(`Accord : ${transposed}`);
        playChordPreview(transposed);
      });
      container.appendChild(chip);
    });
  }

  function renderTabContent(rawContent) {
    const container = document.getElementById('tab-content');
    let formatted = rawContent.replace(/\[([A-Za-z0-9#]+)\]/g, (match, p1) => {
      const chord = transposeChord(p1, currentTransposeSteps);
      return `<span class="chord">${chord}</span>`;
    });
    formatted = formatted.replace(/\[(Intro|Verse \d+|Chorus|Outro|Bridge)\]/g, (match, section) => {
      return `<div class="tab-section-header">[${section}]</div>`;
    });
    container.innerHTML = formatted;
  }

  function transposeChord(chord, steps) {
    if (steps === 0) return chord;
    return chord.replace(/^[A-G][b#]?/, (root) => {
      let index = CHROMATIC_SCALE.indexOf(root);
      if (index === -1) {
        // Flat conversion
        const flatMap = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
        index = CHROMATIC_SCALE.indexOf(flatMap[root] || root);
      }
      if (index === -1) return root;
      let newIndex = (index + steps) % 12;
      if (newIndex < 0) newIndex += 12;
      return CHROMATIC_SCALE[newIndex];
    });
  }

  // Transpose Controls
  function initTransposeControls() {
    document.getElementById('btn-transpose-up').addEventListener('click', () => {
      currentTransposeSteps++;
      updateTranspose();
    });
    document.getElementById('btn-transpose-down').addEventListener('click', () => {
      currentTransposeSteps--;
      updateTranspose();
    });
    document.getElementById('btn-transpose-reset').addEventListener('click', () => {
      currentTransposeSteps = 0;
      updateTranspose();
    });
  }

  function updateTranspose() {
    document.getElementById('transpose-val').textContent = (currentTransposeSteps > 0 ? '+' : '') + currentTransposeSteps;
    const song = DEMO_SONGS[currentSongKey];
    renderChordsList(song.chords);
    renderTabContent(song.content);
    showToast(`Transposition : ${currentTransposeSteps > 0 ? '+' : ''}${currentTransposeSteps}`);
  }

  // Autoscroll Engine
  function initAutoscrollControls() {
    const btnToggle = document.getElementById('btn-scroll-toggle');
    const btnSlower = document.getElementById('btn-scroll-slower');
    const btnFaster = document.getElementById('btn-scroll-faster');
    const barBtnScroll = document.getElementById('bar-btn-scroll');

    const toggleScroll = () => {
      isScrolling = !isScrolling;
      btnToggle.textContent = isScrolling ? '⏸ Pause' : '▶ Démarrer';
      document.getElementById('ug-voice-speed').classList.toggle('visible', isScrolling);
      if (isScrolling) {
        startScrolling();
        showToast('Autoscroll démarré');
      } else {
        stopScrolling();
        showToast('Autoscroll en pause');
      }
    };

    btnToggle.addEventListener('click', toggleScroll);
    barBtnScroll.addEventListener('click', toggleScroll);

    btnSlower.addEventListener('click', () => {
      if (scrollSpeed > 0.5) {
        scrollSpeed = parseFloat((scrollSpeed - 0.25).toFixed(2));
        updateSpeedUI();
      }
    });

    btnFaster.addEventListener('click', () => {
      if (scrollSpeed < 5) {
        scrollSpeed = parseFloat((scrollSpeed + 0.25).toFixed(2));
        updateSpeedUI();
      }
    });
  }

  function updateSpeedUI() {
    document.getElementById('scroll-speed-val').textContent = `${scrollSpeed}x`;
    document.getElementById('ug-voice-speed').textContent = `Vitesse : ${scrollSpeed}x`;
  }

  function startScrolling() {
    if (scrollAnimId) cancelAnimationFrame(scrollAnimId);
    let lastTime = performance.now();

    function step(now) {
      if (!isScrolling) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const tabBox = document.getElementById('tablature-container');
      tabBox.scrollTop += scrollSpeed * 40 * delta;

      if (tabBox.scrollTop + tabBox.clientHeight >= tabBox.scrollHeight - 5) {
        isScrolling = false;
        document.getElementById('btn-scroll-toggle').textContent = '▶ Démarrer';
        showToast('Fin du morceau atteint');
        return;
      }
      scrollAnimId = requestAnimationFrame(step);
    }
    scrollAnimId = requestAnimationFrame(step);
  }

  function stopScrolling() {
    if (scrollAnimId) cancelAnimationFrame(scrollAnimId);
  }

  // Modals System
  function initModals() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.target.getAttribute('data-close');
        closeModal(modalId);
      });
    });

    document.getElementById('btn-quick-tuner').addEventListener('click', () => openModal('modal-tuner'));
    document.getElementById('btn-quick-metro').addEventListener('click', () => openModal('modal-metronome'));
    document.getElementById('btn-quick-piano').addEventListener('click', () => openModal('modal-piano'));

    document.getElementById('bar-btn-tuner').addEventListener('click', () => openModal('modal-tuner'));
    document.getElementById('bar-btn-metronome').addEventListener('click', () => openModal('modal-metronome'));
    document.getElementById('bar-btn-piano').addEventListener('click', () => openModal('modal-piano'));
    document.getElementById('bar-btn-repertoire').addEventListener('click', () => openModal('modal-repertoire'));
    document.getElementById('bar-btn-help').addEventListener('click', () => openModal('modal-help'));

    document.querySelectorAll('.demo-modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modal.id);
        }
      });
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('visible');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('visible');
  }

  // --- Tuner Engine ---
  function initTunerControls() {
    const btnMic = document.getElementById('btn-tuner-mic-toggle');
    btnMic.addEventListener('click', () => {
      if (!tunerActive) {
        startTuner();
      } else {
        stopTuner();
      }
    });
  }

  function startTuner() {
    const ctx = getAudioContext();
    if (!ctx) {
      alert("L'API Web Audio n'est pas supportée par ce navigateur.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      micStream = stream;
      const source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);

      tunerActive = true;
      document.getElementById('btn-tuner-mic-toggle').textContent = "⏹️ Arrêter le micro";
      showToast("Accordeur actif — Jouez une corde");
      updateTunerLoop();
    }).catch(err => {
      console.error(err);
      alert("Accès au microphone refusé ou non disponible.");
    });
  }

  function stopTuner() {
    tunerActive = false;
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    document.getElementById('btn-tuner-mic-toggle').textContent = "🎙️ Démarrer / Autoriser Micro";
    document.getElementById('tuner-note').textContent = "--";
    document.getElementById('tuner-cents').textContent = "-- cents";
    document.getElementById('tuner-freq').textContent = "0.0 Hz";
    document.getElementById('tuner-needle').style.transform = `rotate(0deg)`;
  }

  function updateTunerLoop() {
    if (!tunerActive || !analyser) return;

    const buf = new Float32Array(2048);
    analyser.getFloatTimeDomainData(buf);
    const freq = autoCorrelate(buf, audioCtx.sampleRate);

    if (freq > 0) {
      const pitchInfo = getPitchInfo(freq);
      document.getElementById('tuner-note').textContent = pitchInfo.note;
      document.getElementById('tuner-cents').textContent = `${pitchInfo.cents > 0 ? '+' : ''}${pitchInfo.cents} cents`;
      document.getElementById('tuner-freq').textContent = `${freq.toFixed(1)} Hz`;

      const rotateDeg = Math.max(-45, Math.min(45, pitchInfo.cents));
      const needle = document.getElementById('tuner-needle');
      needle.style.transform = `rotate(${rotateDeg}deg)`;

      const isTune = Math.abs(pitchInfo.cents) < 5;
      needle.classList.toggle('in-tune', isTune);
      document.getElementById('tuner-note').classList.toggle('in-tune', isTune);

      document.querySelectorAll('.string-badge').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-note') === pitchInfo.note);
      });
    }

    requestAnimationFrame(updateTunerLoop);
  }

  function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++)
      for (let j = 0; j < SIZE - i; j++)
        c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    let T0 = maxpos;
    return sampleRate / T0;
  }

  function getPitchInfo(freq) {
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
    const midi = Math.round(noteNum) + 69;
    const noteIndex = (midi % 12 + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const noteName = CHROMATIC_SCALE[noteIndex] + octave;

    const c0Freq = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.floor(1200 * Math.log2(freq / c0Freq));
    return { note: noteName, cents: cents };
  }

  // --- Metronome Engine ---
  function initMetronome() {
    const btnStart = document.getElementById('btn-metro-start');
    const slider = document.getElementById('metro-slider');
    const bpmNum = document.getElementById('metro-bpm-num');

    slider.addEventListener('input', (e) => {
      metroBpm = parseInt(e.target.value);
      bpmNum.textContent = metroBpm;
      if (metroActive) restartMetronome();
    });

    document.getElementById('metro-minus-5').addEventListener('click', () => changeBpm(-5));
    document.getElementById('metro-minus-1').addEventListener('click', () => changeBpm(-1));
    document.getElementById('metro-plus-1').addEventListener('click', () => changeBpm(1));
    document.getElementById('metro-plus-5').addEventListener('click', () => changeBpm(5));

    document.querySelectorAll('.preset-btn[data-bpm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        metroBpm = parseInt(e.target.getAttribute('data-bpm'));
        slider.value = metroBpm;
        bpmNum.textContent = metroBpm;
        if (metroActive) restartMetronome();
      });
    });

    document.getElementById('btn-tap-tempo').addEventListener('click', handleTapTempo);

    document.getElementById('metro-time-sig').addEventListener('change', (e) => {
      metroTimeSig = parseInt(e.target.value);
    });

    document.getElementById('btn-metro-sound-toggle').addEventListener('click', (e) => {
      metroSoundEnabled = !metroSoundEnabled;
      e.target.textContent = metroSoundEnabled ? "🔊 Activé" : "🔇 Muet";
      e.target.classList.toggle('active', metroSoundEnabled);
    });

    btnStart.addEventListener('click', () => {
      metroActive = !metroActive;
      if (metroActive) {
        btnStart.textContent = "⏹️ Arrêter le Métronome";
        btnStart.style.background = "#ef4444";
        startMetronome();
      } else {
        btnStart.textContent = "▶ Démarrer le Métronome";
        btnStart.style.background = "";
        stopMetronome();
      }
    });
  }

  function changeBpm(delta) {
    metroBpm = Math.max(40, Math.min(240, metroBpm + delta));
    document.getElementById('metro-slider').value = metroBpm;
    document.getElementById('metro-bpm-num').textContent = metroBpm;
    if (metroActive) restartMetronome();
  }

  function handleTapTempo() {
    const now = performance.now();
    tapTimes.push(now);
    if (tapTimes.length > 4) tapTimes.shift();
    if (tapTimes.length >= 2) {
      const diffs = [];
      for (let i = 1; i < tapTimes.length; i++) {
        diffs.push(tapTimes[i] - tapTimes[i - 1]);
      }
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 40 && bpm <= 240) {
        metroBpm = bpm;
        document.getElementById('metro-slider').value = metroBpm;
        document.getElementById('metro-bpm-num').textContent = metroBpm;
        if (metroActive) restartMetronome();
      }
    }
  }

  function startMetronome() {
    metroCurrentBeat = 0;
    const intervalMs = (60 / metroBpm) * 1000;
    metroIntervalId = setInterval(triggerBeat, intervalMs);
    triggerBeat();
  }

  function restartMetronome() {
    stopMetronome();
    startMetronome();
  }

  function stopMetronome() {
    if (metroIntervalId) clearInterval(metroIntervalId);
    metroIntervalId = null;
  }

  function triggerBeat() {
    const light = document.getElementById('metro-light');
    const isAccent = (metroCurrentBeat % metroTimeSig === 0);

    light.className = 'metro-light ' + (isAccent ? 'flash-accent' : 'flash');
    setTimeout(() => { light.className = 'metro-light'; }, 100);

    if (metroSoundEnabled) {
      playClick(isAccent ? 1200 : 800);
    }

    metroCurrentBeat = (metroCurrentBeat + 1) % metroTimeSig;
  }

  function playClick(freq) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  // --- Piano Keyboard Engine ---
  function initPiano() {
    const wrapper = document.getElementById('piano-keys-wrapper');
    wrapper.innerHTML = '';

    PIANO_NOTES.forEach(n => {
      const key = document.createElement('div');
      key.className = `piano-key ${n.isBlack ? 'black' : 'white'}`;
      key.setAttribute('data-note', n.note);
      if (!n.isBlack) {
        key.textContent = n.note;
      }
      key.addEventListener('mousedown', () => {
        playPianoNote(n.freq);
        key.classList.add('active');
        activePianoNotes.add(n.note);
        analyzeChord();
      });
      key.addEventListener('mouseup', () => key.classList.remove('active'));
      wrapper.appendChild(key);
    });

    document.getElementById('btn-piano-clear').addEventListener('click', () => {
      activePianoNotes.clear();
      document.querySelectorAll('.piano-key').forEach(k => k.classList.remove('active'));
      document.getElementById('piano-detected-name').textContent = "Aucun accord";
      document.getElementById('piano-chord-notes').textContent = "Notes: aucune";
    });
  }

  function playPianoNote(freq) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  function playChordPreview(chordName) {
    const baseNotes = {
      "C": [261.63, 329.63, 392.00],
      "G": [196.00, 246.94, 293.66],
      "Am": [220.00, 261.63, 329.63],
      "F": [174.61, 220.00, 261.63],
      "Bm": [246.94, 293.66, 369.99],
      "F#": [185.00, 233.08, 277.18],
      "E": [164.81, 207.65, 246.94],
      "D": [146.83, 220.00, 293.66],
      "Em": [164.81, 196.00, 246.94],
      "Em7": [164.81, 196.00, 246.94, 293.66]
    };
    const freqs = baseNotes[chordName] || [261.63, 329.63, 392.00];
    freqs.forEach(f => playPianoNote(f));
  }

  function analyzeChord() {
    const notesArr = Array.from(activePianoNotes);
    if (notesArr.length === 0) return;

    document.getElementById('piano-chord-notes').textContent = `Notes: ${notesArr.join(' - ')}`;

    // Simple chord recognition rules
    const roots = notesArr.map(n => n.replace(/\d/, ''));
    if (roots.includes('C') && roots.includes('E') && roots.includes('G')) {
      document.getElementById('piano-detected-name').textContent = 'C Major';
    } else if (roots.includes('A') && roots.includes('C') && roots.includes('E')) {
      document.getElementById('piano-detected-name').textContent = 'A Minor';
    } else if (roots.includes('G') && roots.includes('B') && roots.includes('D')) {
      document.getElementById('piano-detected-name').textContent = 'G Major';
    } else if (roots.includes('E') && roots.includes('G') && roots.includes('B')) {
      document.getElementById('piano-detected-name').textContent = 'E Minor';
    } else {
      document.getElementById('piano-detected-name').textContent = roots[0] + ' Accord';
    }
  }

  // --- Voice Engine ---
  function initVoiceEngine() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const badge = document.getElementById('speech-support-badge');
    const voiceBtn = document.getElementById('ug-voice-btn');

    if (!SpeechRecognition) {
      badge.textContent = "Navigateur sans commande vocale (Utilisez les boutons)";
      badge.className = "speech-badge warning";
      voiceBtn.title = "Reconnaissance vocale exclusive à Chrome/Edge";
      voiceBtn.addEventListener('click', () => {
        alert("La reconnaissance vocale Web Speech API est disponible sur Google Chrome et Microsoft Edge. Vous pouvez toujours utiliser les boutons interactifs ci-dessous !");
      });
      return;
    }

    badge.textContent = "Commande vocale disponible (Dites 'Roddy')";
    badge.className = "speech-badge";

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'fr-FR';

    recognition.onresult = (e) => {
      const last = e.results.length - 1;
      const text = e.results[last][0].transcript.trim().toLowerCase();
      console.log("[VoxRoddy Demo] Entendu:", text);

      if (text.includes('roddy')) {
        handleVoiceCommand(text);
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech error:", e.error);
    };

    recognition.onend = () => {
      if (isListening) recognition.start();
    };

    voiceBtn.addEventListener('click', () => {
      isListening = !isListening;
      voiceBtn.classList.toggle('listening', isListening);
      document.getElementById('ug-voice-status').textContent = isListening ? "RODDY ÉCOUTE..." : "RODDY INACTIF";
      if (isListening) {
        recognition.start();
        showToast("Reconnaissance vocale activée. Dites 'Roddy' !");
      } else {
        recognition.stop();
        showToast("Reconnaissance vocale en pause.");
      }
    });
  }

  function handleVoiceCommand(text) {
    if (text.includes('défile') || text.includes('scroll') || text.includes('démarrer')) {
      document.getElementById('btn-scroll-toggle').click();
    } else if (text.includes('stop') || text.includes('pause') || text.includes('arrête')) {
      if (isScrolling) document.getElementById('btn-scroll-toggle').click();
    } else if (text.includes('accordeur') || text.includes('tuner')) {
      openModal('modal-tuner');
    } else if (text.includes('métronome') || text.includes('metronome')) {
      openModal('modal-metronome');
    } else if (text.includes('clavier') || text.includes('piano')) {
      openModal('modal-piano');
    } else if (text.includes('plus vite')) {
      document.getElementById('btn-scroll-faster').click();
    } else if (text.includes('plus lent')) {
      document.getElementById('btn-scroll-slower').click();
    } else if (text.includes('transpose')) {
      document.getElementById('btn-transpose-up').click();
    }
  }

  // --- Toast Notification ---
  function showToast(msg) {
    const container = document.getElementById('ug-voice-feedback');
    const toast = document.createElement('div');
    toast.className = 'ug-voice-toast success show';
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
})();
