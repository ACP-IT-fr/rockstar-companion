// widgets/tuner.js
(function() {
  if (!window.RockstarCore) return;

  let tunerContainer = null;
  let tunerNoteEl = null;
  let tunerCentsEl = null;
  let tunerStringEl = null;
  let tunerActive = false;
  let pitchHistory = [];
  
  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const standardStrings = [
    { note: "E2", midi: 40, string: "6th string (E)" },
    { note: "A2", midi: 45, string: "5th string (A)" },
    { note: "D3", midi: 50, string: "4th string (D)" },
    { note: "G3", midi: 55, string: "3rd string (G)" },
    { note: "B3", midi: 59, string: "2nd string (B)" },
    { note: "E4", midi: 64, string: "1st string (e)" }
  ];

  function initTuner() {
    const audioContext = window.RockstarCore.getAudioContext();
    let analyser = window.RockstarCore.getAnalyser();

    const unlockAudioContext = () => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          if (audioContext.state === 'running') {
            window.removeEventListener('click', unlockAudioContext);
            window.removeEventListener('keydown', unlockAudioContext);
            window.removeEventListener('touchstart', unlockAudioContext);
          }
        }).catch(err => {
          console.error("[RockstarTuner] Failed to resume AudioContext", err);
        });
      } else if (audioContext && audioContext.state === 'running') {
        window.removeEventListener('click', unlockAudioContext);
        window.removeEventListener('keydown', unlockAudioContext);
        window.removeEventListener('touchstart', unlockAudioContext);
      }
    };

    if (analyser) {
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          if (audioContext.state === 'suspended') {
            window.addEventListener('click', unlockAudioContext);
            window.addEventListener('keydown', unlockAudioContext);
            window.addEventListener('touchstart', unlockAudioContext);
          }
        }).catch(err => {
          console.error("[RockstarTuner] Failed to resume on initTuner", err);
          window.addEventListener('click', unlockAudioContext);
          window.addEventListener('keydown', unlockAudioContext);
          window.addEventListener('touchstart', unlockAudioContext);
        });
      }
      if (tunerContainer) tunerContainer.classList.add('visible');
      tunerActive = true;
      updateTuner();
      return;
    }
    
    // Initialiser l'analyser
    const newAnalyser = audioContext.createAnalyser();
    newAnalyser.fftSize = 16384;
    window.RockstarCore.setAnalyser(newAnalyser);

    window.addEventListener('click', unlockAudioContext);
    window.addEventListener('keydown', unlockAudioContext);
    window.addEventListener('touchstart', unlockAudioContext);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(newAnalyser);
      tunerActive = true;
      if (tunerContainer) tunerContainer.classList.add('visible');
      updateTuner();
    }).catch(err => {
      console.error("[RockstarTuner] Microphone access denied for tuner", err);
    });
  }

  function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      let val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // not enough signal

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++)
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++)
      if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

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

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  function updateTuner() {
    const analyser = window.RockstarCore.getAnalyser();
    const audioContext = window.RockstarCore.getAudioContext();
    if (!tunerActive || !analyser || !tunerContainer || !tunerNoteEl || !tunerCentsEl || !tunerStringEl) return;

    requestAnimationFrame(updateTuner);
    
    // Déclencher la détection d'accords s'il y a un détecteur d'accords chargé
    if (window.RockstarCore.detectChord) {
      window.RockstarCore.detectChord();
    }

    const buf = new Float32Array(2048);
    analyser.getFloatTimeDomainData(buf);
    const ac = autoCorrelate(buf, audioContext.sampleRate);

    if (ac == -1) {
      pitchHistory = [];
      return;
    }
    
    pitchHistory.push(ac);
    if (pitchHistory.length > 5) pitchHistory.shift();
    
    const sortedPitches = [...pitchHistory].sort((a, b) => a - b);
    const smoothedPitch = sortedPitches[Math.floor(sortedPitches.length / 2)];

    const noteNum = Math.round(12 * (Math.log(smoothedPitch / 440) / Math.log(2))) + 69;
    const noteName = noteStrings[noteNum % 12];
    const octave = Math.floor(noteNum / 12) - 1;
    
    tunerNoteEl.innerText = `${noteName}${octave}`;
    
    const targetFreq = 440 * Math.pow(2, (noteNum - 69) / 12);
    const cents = Math.floor(1200 * Math.log(smoothedPitch / targetFreq) / Math.log(2));
    
    if (Math.abs(cents) <= 15) {
      tunerCentsEl.className = 'tuner-cents tuner-perfect';
      tunerCentsEl.innerText = 'Juste';
    } else if (cents < 0) {
      tunerCentsEl.className = 'tuner-cents tuner-flat';
      tunerCentsEl.innerText = 'Trop bas (' + cents + 'c)';
    } else {
      tunerCentsEl.className = 'tuner-cents tuner-sharp';
      tunerCentsEl.innerText = 'Trop haut (+' + cents + 'c)';
    }

    let closestString = null;
    let minDiff = Infinity;
    for (const s of standardStrings) {
      const diff = Math.abs(s.midi - noteNum);
      if (diff < minDiff) {
        minDiff = diff;
        closestString = s.string;
      }
    }
    
    if (minDiff <= 4) {
       tunerStringEl.innerText = `Corde: ${closestString}`;
    } else {
       tunerStringEl.innerText = '';
    }
  }

  // Register commands on RockstarCore
  window.RockstarCore.registerCommand({
    name: 'Guitar Tuner',
    variants: ['accordeur', 'tuner'],
    handler: () => {
      initTuner();
      return { success: true, action: 'Activation de l’accordeur' };
    }
  });

  // Help Panel Command
  window.RockstarCore.registerHelpCommand({ label: "🎸 Accordeur", cmd: "accordeur", env: "tab" });

  // Handle listening state changes to clean up or auto-init
  window.RockstarCore.onListeningChanged((isListening) => {
    // Keep tuner active even when voice control is off
  });

  // Init tuner UI
  window.RockstarCore.registerInit(() => {
    tunerContainer = document.createElement('div');
    tunerContainer.id = 'ug-tuner';
    tunerContainer.innerHTML = `
      <div class="tuner-label">Note</div>
      <div class="tuner-note">-</div>
      <div class="tuner-cents"></div>
      <div class="tuner-string"></div>
    `;
    document.body.appendChild(tunerContainer);
    
    tunerNoteEl = tunerContainer.querySelector('.tuner-note');
    tunerCentsEl = tunerContainer.querySelector('.tuner-cents');
    tunerStringEl = tunerContainer.querySelector('.tuner-string');

    // Synchronisation de l'état initial
    initTuner();
  });

  // Expose init methods
  window.RockstarCore.initTuner = initTuner;
})();
