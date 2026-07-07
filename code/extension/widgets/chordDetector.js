// widgets/chordDetector.js
(function() {
  if (!window.RockstarCore) return;

  let chordContainer = null;
  let chordNameEl = null;
  let chordHistory = [];
  let chordClearTimeout = null;
  const freqBuf = new Float32Array(8192);
  let chordTemplates = {};

  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function buildChordTemplates(enable7th, enableSus) {
    chordTemplates = {};
    const chordIntervals = {
      "": [0, 4, 7],           // Major
      "m": [0, 3, 7]           // Minor
    };
    
    if (enable7th) {
      chordIntervals["7"] = [0, 4, 7, 10];
      chordIntervals["maj7"] = [0, 4, 7, 11];
      chordIntervals["m7"] = [0, 3, 7, 10];
    }
    
    if (enableSus) {
      chordIntervals["sus2"] = [0, 2, 7];
      chordIntervals["sus4"] = [0, 5, 7];
    }

    for (let i = 0; i < 12; i++) {
      const rootName = noteStrings[i];
      for (const [suffix, intervals] of Object.entries(chordIntervals)) {
        const template = new Array(12).fill(0);
        for (const inv of intervals) {
          template[(i + inv) % 12] = 1;
        }
        chordTemplates[rootName + suffix] = template;
      }
    }
  }

  function detectChord() {
    const analyser = window.RockstarCore.getAnalyser();
    const audioContext = window.RockstarCore.getAudioContext();
    if (!analyser || !chordContainer || !chordNameEl) return;

    analyser.getFloatFrequencyData(freqBuf);
    const chromagram = new Array(12).fill(0);
    const binSize = audioContext.sampleRate / analyser.fftSize;

    // Frequencies from ~65Hz (C2) to ~2000Hz
    const minBin = Math.floor(65 / binSize);
    const maxBin = Math.floor(2000 / binSize);

    let totalEnergy = 0;
    for (let i = minBin; i < maxBin; i++) {
      const db = freqBuf[i];
      if (db < -70) continue; // Noise floor
      
      const freq = i * binSize;
      const noteNum = Math.round(12 * Math.log2(freq / 440)) + 69;
      const pitchClass = noteNum % 12;
      
      const energy = Math.pow(10, db / 20); // Linear magnitude
      chromagram[pitchClass] += energy;
      totalEnergy += energy;
    }

    if (totalEnergy < 0.1) {
       if (!chordClearTimeout) {
         chordClearTimeout = setTimeout(() => {
           chordNameEl.innerText = "-";
           chordHistory = [];
           chordClearTimeout = null;
         }, 1500);
       }
       return;
    }
    
    if (chordClearTimeout) {
      clearTimeout(chordClearTimeout);
      chordClearTimeout = null;
    }
    
    let maxE = Math.max(...chromagram);
    if (maxE > 0) {
      for(let i=0; i<12; i++) chromagram[i] /= maxE;
    }

    let bestChord = "-";
    let bestScore = -1;

    for (const [chordName, template] of Object.entries(chordTemplates)) {
        let dotProduct = 0, templateMag = 0, chromaMag = 0;
        for (let i = 0; i < 12; i++) {
          dotProduct += chromagram[i] * template[i];
          templateMag += template[i] * template[i];
          chromaMag += chromagram[i] * chromagram[i];
        }
        if (templateMag === 0 || chromaMag === 0) continue;
        const score = dotProduct / (Math.sqrt(templateMag) * Math.sqrt(chromaMag));
        if (score > bestScore) {
          bestScore = score;
          bestChord = chordName;
        }
    }

    if (bestScore > 0.65) {
       chordHistory.push(bestChord);
       if (chordHistory.length > 10) chordHistory.shift();
       
       const counts = {};
       let maxCount = 0;
       let stableChord = bestChord;
       for (const c of chordHistory) {
         counts[c] = (counts[c] || 0) + 1;
         if (counts[c] > maxCount) {
            maxCount = counts[c];
            stableChord = c;
         }
       }

       chordNameEl.innerText = stableChord;
    }
  }

  // Subscribe to settings changes to build templates dynamically
  window.RockstarCore.onSettingsChanged((settings) => {
    buildChordTemplates(settings.chord7th || false, settings.chordSus || false);
  });

  // Handle listening state changes to show/hide chord UI
  window.RockstarCore.onListeningChanged((isListening) => {
    // Keep chord UI visible even when voice control is off
  });

  // Init chord UI
  window.RockstarCore.registerInit(() => {
    chordContainer = document.createElement('div');
    chordContainer.id = 'ug-chord';
    chordContainer.innerHTML = `
      <div class="tuner-label">Accord</div>
      <div class="chord-name">-</div>
    `;
    document.body.appendChild(chordContainer);
    
    chordNameEl = chordContainer.querySelector('.chord-name');

    // Synchronisation de l'état initial
    chordContainer.classList.add('visible');
  });

  // Expose the chord detection loop so tuner.js can call it
  window.RockstarCore.detectChord = detectChord;
})();
