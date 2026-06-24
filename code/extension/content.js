const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.warn("Web Speech API not supported in this browser.");
} else {
  let isListening = false;
  let isAwake = false;
  let isAutoStart = false;
  let awakeTimeout = null;
  let scrollInterval = null;
  
  const textToNum = {
    '10': 10, 'dix': 10, 'dis': 10, 'ten': 10,
    '9': 9, 'neuf': 9, 'nine': 9,
    '8': 8, 'huit': 8, 'oui': 8, 'eight': 8,
    '7': 7, 'sept': 7, 'set': 7, 'seven': 7,
    '6': 6, 'six': 6, 'sis': 6,
    '5': 5, 'cinq': 5, 'sync': 5, 'five': 5,
    '4': 4, 'quatre': 4, 'cat': 4, 'four': 4, 'for': 4,
    '3': 3, 'trois': 3, 'toi': 3, 'three': 3, 'tree': 3,
    '2': 2, 'deux': 2, 'de': 2, 'two': 2, 'to': 2,
    '1': 1, 'un': 1, 'in': 1, 'one': 1
  };
  const numPattern = "(10|dix|dis|ten|9|neuf|nine|8|huit|oui|eight|7|sept|set|seven|6|six|sis|5|cinq|sync|five|4|quatre|cat|four|for|3|trois|toi|three|tree|2|deux|de|two|to|1|un|in|one)";

  let scrollSpeed = 1; // Default speed 1
  let lastSpeedChange = 0;
  let wakeWord = 'Rockstar';
  let wakeWordLower = 'rockstar';
  
  const currentDomain = window.location.hostname;
  const isUG = currentDomain.endsWith('ultimate-guitar.com');
  
  const storageKey = 'ug_voice_speed_' + window.location.pathname;
  const savedSpeed = localStorage.getItem(storageKey);
  if (savedSpeed) {
    const parsed = parseInt(savedSpeed, 10);
    if (!isNaN(parsed)) scrollSpeed = Math.max(1, Math.min(parsed, 10));
  }

  let currentDirection = 0;
  let accumulatedScroll = 0;
  
  // Outer scope references for elements
  let tunerContainer = null;
  let tunerNoteEl = null;
  let tunerCentsEl = null;
  let tunerStringEl = null;
  
  let chordContainer = null;
  let chordNameEl = null;
  
  let btn = null;
  let iconSpan = null;
  let statusSpan = null;
  
  let feedbackContainer = null;
  let liveTextContainer = null;
  let speedContainer = null;
  let bannerEl = null;
  
  let isInitialized = false;
  let isSuspendedByVisibility = false;
  let recognition = null;

  let audioContext = null;
  let analyser = null;
  let tunerActive = false;
  let pitchHistory = [];
  let chordHistory = [];
  let chordClearTimeout = null;
  const freqBuf = new Float32Array(8192);

  function initTuner() {
    if (audioContext) {
      if (audioContext.state === 'suspended') audioContext.resume();
      tunerContainer.classList.add('visible');
      chordContainer.classList.add('visible');
      tunerActive = true;
      updateTuner();
      return;
    }
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 16384;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      tunerActive = true;
      tunerContainer.classList.add('visible');
      chordContainer.classList.add('visible');
      updateTuner();
    }).catch(err => {
      console.error("[Rockstar] Microphone access denied for tuner", err);
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

  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const standardStrings = [
    { note: "E2", midi: 40, string: "6th string (E)" },
    { note: "A2", midi: 45, string: "5th string (A)" },
    { note: "D3", midi: 50, string: "4th string (D)" },
    { note: "G3", midi: 55, string: "3rd string (G)" },
    { note: "B3", midi: 59, string: "2nd string (B)" },
    { note: "E4", midi: 64, string: "1st string (e)" }
  ];

  let chordTemplates = {};

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

  function updateUIForWakeWord() {
    if (isListening && !isAwake && statusSpan && btn) {
      statusSpan.innerText = `Listening (Say ${wakeWord}...)`;
      btn.title = `Listening for "${wakeWord}"... Click to turn off`;
    }
  }

  function detectChord() {
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
           chordContainer.style.opacity = '0.3';
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

       chordContainer.style.opacity = '1';
       chordNameEl.innerText = stableChord;
    }
  }

  function updateTuner() {
    if (!tunerActive || !analyser || !tunerContainer || !tunerNoteEl || !tunerCentsEl || !tunerStringEl) return;

    requestAnimationFrame(updateTuner);
    detectChord();

    const buf = new Float32Array(2048);
    analyser.getFloatTimeDomainData(buf);
    const ac = autoCorrelate(buf, audioContext.sampleRate);

    if (ac == -1) {
      tunerContainer.style.opacity = '0.3';
      pitchHistory = [];
      return;
    }
    
    pitchHistory.push(ac);
    if (pitchHistory.length > 5) pitchHistory.shift();
    
    const sortedPitches = [...pitchHistory].sort((a, b) => a - b);
    const smoothedPitch = sortedPitches[Math.floor(sortedPitches.length / 2)];

    tunerContainer.style.opacity = '1';
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

  function initializeRockstar() {
    if (isInitialized) return;
    isInitialized = true;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    // Create tuner UI elements
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
    
    chordContainer = document.createElement('div');
    chordContainer.id = 'ug-chord';
    chordContainer.innerHTML = `
      <div class="tuner-label">Accord</div>
      <div class="chord-name">-</div>
    `;
    document.body.appendChild(chordContainer);
    
    chordNameEl = chordContainer.querySelector('.chord-name');

    // Create voice controls button
    btn = document.createElement('button');
    btn.id = 'ug-voice-btn';
    
    iconSpan = document.createElement('span');
    iconSpan.innerText = '🎤';
    
    statusSpan = document.createElement('span');
    statusSpan.id = 'ug-voice-status';
    statusSpan.innerText = 'Off';
    
    btn.appendChild(iconSpan);
    btn.appendChild(statusSpan);
    btn.title = 'Voice control OFF. Click to enable';
    document.body.appendChild(btn);

    feedbackContainer = document.createElement('div');
    feedbackContainer.id = 'ug-voice-feedback';
    document.body.appendChild(feedbackContainer);

    liveTextContainer = document.createElement('div');
    liveTextContainer.id = 'ug-voice-live-text';
    document.body.appendChild(liveTextContainer);

    speedContainer = document.createElement('div');
    speedContainer.id = 'ug-voice-speed';
    speedContainer.innerText = 'Speed: ' + scrollSpeed;
    document.body.appendChild(speedContainer);

    btn.addEventListener('click', () => {
      if (isListening) {
        stopListening();
      } else {
        startListening(false);
      }
    });

    const speedUpVariants = ['faster', 'speed up', 'plus vite', 'accélère', 'accelere', 'accélérer', 'accelerer', 'acceler', 'accélér', 'plus rapide'];
    const slowDownVariants = ['slower', 'slow down', 'moins vite', 'ralentis', 'ralenti', 'ralentir', 'doucement', 'plus doucement', 'moins rapide'];

    recognition.onend = () => {
      if (isListening && !isSuspendedByVisibility) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.error("Error restarting recognition", e);
          }
        }, 100);
      }
    };

    recognition.onresult = (event) => {
      let interimRaw = '';
      
      function normalize(text) {
        let normalized = text.toLowerCase()
                   .replace(/-/g, ' ')
                   .trim();
        
        if (wakeWordLower === 'rockstar') {
          normalized = normalized.replace(/rock\s*star/g, 'rockstar')
                                 .replace(/roxstar/g, 'rockstar')
                                 .replace(/rock's tar/g, 'rockstar');
        } else {
          const escaped = wakeWordLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const pattern = escaped.replace(/\s+/g, '\\s*');
          const regex = new RegExp(pattern, 'g');
          normalized = normalized.replace(regex, wakeWordLower);
        }
        return normalized;
      }

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        const normalized = normalize(transcript);
        
        if (!isAwake) {
          if (normalized.includes(wakeWordLower)) {
            wakeUp();
          }
        }

        if (isAwake || normalized.includes(wakeWordLower)) {
          const now = Date.now();
          if (now - lastSpeedChange > 500) {
            let changed = false;
            
            const speedSetRegex = new RegExp("(?:vitesse|speed|niveau|level)\\s*(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "\\b", "i");
            const speedSetMatch = normalized.match(speedSetRegex);
            
            if (speedSetMatch) {
               const val = textToNum[speedSetMatch[1].toLowerCase()];
               if (val) {
                 setSpeed(val);
                 changed = true;
               }
            } else if (speedUpVariants.some(v => normalized.includes(v))) {
               adjustSpeed(1);
               changed = true;
            } else if (slowDownVariants.some(v => normalized.includes(v))) {
               adjustSpeed(-1);
               changed = true;
            }
            if (changed) {
               lastSpeedChange = now;
               showFeedback(`⚡ Speed Level ${scrollSpeed}`, true);
               clearTimeout(awakeTimeout);
               awakeTimeout = setTimeout(() => goToSleep(), 15000);
               recognition.stop();
               return;
            }
          }
        }
        
        if (event.results[i].isFinal) {
          let finalTranscript = normalized;
          console.log("Voice Command Recognized:", finalTranscript);
          liveTextContainer.innerText = '';
          liveTextContainer.style.display = 'none';

          if (finalTranscript.includes(wakeWordLower)) {
            if (!isAwake) wakeUp();
            finalTranscript = finalTranscript.replace(wakeWordLower, '').trim();
            if (finalTranscript.length > 0) {
              handleCommand(finalTranscript);
            }
          } else if (isAwake) {
            clearTimeout(awakeTimeout);
            awakeTimeout = setTimeout(() => goToSleep(), 15000);
            handleCommand(finalTranscript);
          } else {
            console.log("Ignored (sleeping):", finalTranscript);
          }
        } else {
          interimRaw += transcript + ' ';
        }
      }
      
      if (interimRaw.trim() !== '') {
        const normalizedInterim = normalize(interimRaw);
        const wordCount = normalizedInterim.trim().split(/\s+/).length;
        if (wordCount > 10) {
          liveTextContainer.style.display = 'none';
          recognition.stop();
          return;
        }

        if (!isAwake && !normalizedInterim.includes(wakeWordLower)) {
          liveTextContainer.style.display = 'none';
        } else {
          liveTextContainer.innerText = normalizedInterim;
          liveTextContainer.style.display = 'block';
        }
      }
    };
    
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        stopListening();
        if (!isAutoStart) {
          alert("Microphone permission denied. Please allow microphone access to use voice commands.");
        }
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (isListening && !isSuspendedByVisibility) {
          isSuspendedByVisibility = true;
          try {
            recognition.stop();
          } catch (e) {}
          if (tunerActive && audioContext && audioContext.state === 'running') {
            audioContext.suspend();
          }
          if (statusSpan) {
            statusSpan.innerText = 'Tab Inactif';
          }
        }
      } else {
        if (isSuspendedByVisibility) {
          isSuspendedByVisibility = false;
          if (isListening) {
            try {
              recognition.start();
              if (statusSpan) {
                statusSpan.innerText = isAwake ? "À l'écoute" : `Listening (Say ${wakeWord}...)`;
              }
            } catch (e) {
              console.error("Error restarting recognition on visibility change", e);
            }
            if (tunerActive && audioContext && audioContext.state === 'suspended') {
              audioContext.resume();
            }
          }
        }
      }
    });

    // Auto-start listening on load
    startListening(true);
    
    if (isUG) {
      highlightBestResults();
      numberSearchResults();
    }
  }

  function updateSpeedUI() {
    if (speedContainer) {
      speedContainer.innerText = 'Speed: ' + scrollSpeed;
    }
  }

  function adjustSpeed(delta) {
    setSpeed(scrollSpeed + delta);
  }

  function setSpeed(val) {
    scrollSpeed = Math.max(1, Math.min(val, 10));
    updateSpeedUI();
    localStorage.setItem(storageKey, scrollSpeed);
  }

  function showFeedback(text, isSuccess) {
    if (!feedbackContainer) return;
    const toast = document.createElement('div');
    toast.className = 'ug-voice-toast ' + (isSuccess ? 'success' : 'error');
    toast.innerText = text;
    feedbackContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  function startListening(auto = false) {
    isAutoStart = auto;
    isSuspendedByVisibility = false;
    if (!isListening) {
      initTuner();
      try {
        recognition.start();
        isListening = true;
        if (btn) btn.classList.add('listening');
        updateUIForWakeWord();
      } catch (e) {
        console.error("Speech recognition could not start", e);
      }
    } else {
      stopListening();
    }
  }

  function stopListening() {
    isListening = false;
    isSuspendedByVisibility = false;
    if (tunerActive) {
       tunerActive = false;
       if (tunerContainer) tunerContainer.classList.remove('visible');
       if (chordContainer) chordContainer.classList.remove('visible');
       if (audioContext && audioContext.state === 'running') {
          audioContext.suspend();
       }
    }
    try {
      recognition.stop();
    } catch (e) { }
    isAwake = false;
    if (btn) {
      btn.classList.remove('listening', 'awake');
      statusSpan.innerText = 'Off';
      btn.title = 'Voice control OFF. Click to enable';
    }
    stopScrolling();
  }

  function wakeUp() {
    isAwake = true;
    if (btn) btn.classList.add('awake');
    if (statusSpan) statusSpan.innerText = "À l'écoute";
    showFeedback(`🎸 ${wakeWord} is listening...`, true);
    clearTimeout(awakeTimeout);
    awakeTimeout = setTimeout(() => {
      goToSleep();
    }, 15000);
  }

  function goToSleep() {
    isAwake = false;
    if (btn) btn.classList.remove('awake');
    if (statusSpan) statusSpan.innerText = 'Veille';
    showFeedback(`💤 ${wakeWord} is sleeping...`, true);
  }

  function handleCommand(command) {
    let action = '';
    let isSuccess = true;
    const cmd = command.toLowerCase().trim();

    const scrollDownVariants = ['scroll down', 'descend', 'dessin', 'descent', 'en bas', 'plus bas', 'go down', 'down', 'bas'];
    const scrollUpVariants = ['scroll up', 'monte', 'montre', 'en haut', 'plus haut', 'go up', 'up', 'haut', 'remonte'];
    const pauseVariants = ['pause', 'stop scroll', 'arrête le scroll', 'arrete le scroll', 'fige', 'bloque', 'suspend'];
    const sleepVariants = ['stop', 'arrête', 'arrete', 'arrêt', 'arret', 'stoppe', 'stopper', 'stopp', 'dors', 'endors', 'sleep', 'merci', 'c\'est tout'];
    const topVariants = ['début', 'debut', 'tout en haut', 'go to top', 'top', 'reviens', 'commencement'];
    const searchPlaylistPrefixes = [
      'playlist search ', 'search playlist ', 
      'cherche dans ma playlist ', 'chercher dans ma playlist ', 'cherche dans mes playlists ', 'chercher dans mes playlists ',
      'cherche playlist ', 'chercher playlist ',
      'trouve dans ma playlist ', 'trouver dans ma playlist ', 'trouve dans mes playlists ', 'trouver dans mes playlists '
    ];
    const searchPrefixes = ['search for ', 'search ', 'cherche ', 'chercher ', 'trouve ', 'trouver ', 'find '];

    const openNumRegex = new RegExp("^(?:ouvre|open|go to|choisis|prends|lance)?\\s*(?:le\\s+|la\\s+|the\\s+)?(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "$", "i");
    const numMatch = cmd.match(openNumRegex);

    if (scrollDownVariants.some(v => cmd === v || cmd.includes(v))) {
      startScrolling(1);
      action = 'Scrolling down';
    } else if (scrollUpVariants.some(v => cmd === v || cmd.includes(v))) {
      startScrolling(-1);
      action = 'Scrolling up';
    } else if (pauseVariants.some(v => cmd === v || cmd.includes(v))) {
      stopScrolling();
      action = 'Pausing scroll';
    } else if (topVariants.some(v => cmd === v || cmd.includes(v))) {
      stopScrolling();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      action = 'Going to top';
    } else if (sleepVariants.some(v => cmd === v || cmd.includes(v))) {
      stopScrolling();
      goToSleep();
      action = 'Going to sleep';
    } else if (numMatch) {
      if (!isUG) {
        isSuccess = false;
        action = 'Recherche non disponible sur ce site';
      } else {
        const num = textToNum[numMatch[1].toLowerCase()];
        if (num && window.ugSearchResultLinks && window.ugSearchResultLinks[num]) {
          window.location.href = window.ugSearchResultLinks[num];
          action = `Opening result number ${num}`;
        } else {
          isSuccess = false;
          action = `Result number ${num || numMatch[1]} not found on this page`;
        }
      }
    } else {
      let isSearchCmd = false;
      let targetQuery = '';
      let isPlaylist = false;

      for (const prefix of searchPlaylistPrefixes) {
        if (cmd.startsWith(prefix)) {
          targetQuery = cmd.substring(prefix.length).trim();
          isPlaylist = true;
          isSearchCmd = true;
          break;
        }
      }

      if (!isSearchCmd) {
        for (const prefix of searchPrefixes) {
          if (cmd.startsWith(prefix)) {
            targetQuery = cmd.substring(prefix.length).trim();
            isSearchCmd = true;
            break;
          }
        }
      }

      if (isSearchCmd) {
        if (!isUG) {
          isSuccess = false;
          action = 'Recherche non disponible sur ce site';
        } else if (targetQuery) {
          if (isPlaylist) {
            searchPlaylistUG(targetQuery);
            action = `Searching playlist for "${targetQuery}"`;
          } else {
            searchUG(targetQuery);
            action = `Searching for "${targetQuery}"`;
          }
        } else {
          isSuccess = false;
          action = 'Recherche vide';
        }
      } else {
        isSuccess = false;
        action = 'Unrecognized command';
      }
    }
    
    showFeedback(`🎤 Heard: "${command}"\n${action}`, isSuccess);
  }

  function startScrolling(direction) {
    stopScrolling();
    currentDirection = direction;
    accumulatedScroll = 0;
    
    if (speedContainer) speedContainer.classList.add('visible');
    
    scrollInterval = setInterval(() => {
      accumulatedScroll += currentDirection * (scrollSpeed / 10);
      
      if (Math.abs(accumulatedScroll) >= 1) {
        let pixels = Math.trunc(accumulatedScroll);
        window.scrollBy(0, pixels);
        accumulatedScroll -= pixels;
      }
    }, 20);
  }

  function stopScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
      if (speedContainer) speedContainer.classList.remove('visible');
    }
  }

  function searchUG(query) {
    const url = `https://www.ultimate-guitar.com/search.php?title=${encodeURIComponent(query)}&page=1&type[0]=300&rating[0]=4&rating[1]=5&order=myweight`;
    window.location.href = url;
  }

  function searchPlaylistUG(query) {
    const url = `https://www.ultimate-guitar.com/user/mytabs?search=${encodeURIComponent(query)}`;
    window.location.href = url;
  }

  function highlightBestResults() {
    console.log("[Rockstar] Starting highlightBestResults...");
    if (!window.location.href.includes('search.php')) {
      console.log("[Rockstar] Not a search.php page.");
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attempts > 20) {
        console.log("[Rockstar] Timed out waiting for .js-store");
        clearInterval(interval);
        return;
      }

      const storeDiv = document.querySelector('.js-store');
      if (!storeDiv) return;

      try {
        console.log("[Rockstar] Found .js-store!");
        const state = JSON.parse(storeDiv.getAttribute('data-content'));
        
        let results = [];
        if (state && state.store && state.store.page && state.store.page.data) {
          const data = state.store.page.data;
          if (Array.isArray(data.results)) {
            results = data.results;
          } else {
            function findTabs(obj, depth = 0) {
              if (depth > 5 || !obj) return [];
              for (let key in obj) {
                if (Array.isArray(obj[key]) && obj[key].length > 0 && (obj[key][0].tab_url || obj[key][0].url)) {
                  return obj[key];
                } else if (obj[key] !== null && typeof obj[key] === 'object') {
                  const res = findTabs(obj[key], depth + 1);
                  if (res.length > 0) return res;
                }
              }
              return [];
            }
            results = findTabs(data);
          }
        }

        if (results.length === 0) {
           console.log("[Rockstar] No results array found yet.");
           return; 
        }

        clearInterval(interval);
        console.log("[Rockstar] Results extracted:", results.length);

        const chords = results.filter(r => (r.type === 'Chords' || r.type === 'chords' || r.type_name === 'Chords') && !r.is_pro);
        if (chords.length === 0) {
          console.log("[Rockstar] No 'Chords' tabs found.");
          return;
        }

        const bestChords = chords.sort((a, b) => (b.votes || b.rating || 0) - (a.votes || a.rating || 0))[0];
        const bestUrl = bestChords.tab_url || bestChords.url;

        console.log("[Rockstar] Best chords found:", bestChords);

        if (!bestUrl) return;

        let domAttempts = 0;
        const domInterval = setInterval(() => {
          domAttempts++;
          if (domAttempts > 20) {
            console.log("[Rockstar] Timed out waiting for DOM link:", bestUrl);
            clearInterval(domInterval);
            return;
          }

          const links = Array.from(document.querySelectorAll('a')).filter(a => a.href === bestUrl || a.href.includes(bestUrl));
          
          if (links.length > 0) {
            console.log("[Rockstar] Found links in DOM:", links.length);
            clearInterval(domInterval);
            
            links.forEach(link => {
              if (link.parentElement) {
                link.parentElement.classList.add('ug-voice-highlighted-row');
              }
            });
            
            const customRow = document.createElement('div');
            customRow.style.padding = '15px';
            customRow.style.margin = '20px 0';
            customRow.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
            customRow.style.border = '2px solid #ffc107';
            customRow.style.borderRadius = '8px';
            customRow.innerHTML = `
              <div style="color: #ffc107; font-weight: bold; margin-bottom: 5px; font-size: 14px;">⭐ MEILLEUR RÉSULTAT (Trouvé par Rockstar)</div>
              <a href="${bestUrl}" style="color: #fff; font-size: 18px; text-decoration: none; font-weight: bold;">
                ${bestChords.artist_name || bestChords.artist || ''} - ${bestChords.song_name || bestChords.title || 'Tab'}
              </a>
              <div style="color: #aaa; margin-top: 5px; font-size: 14px;">
                🎸 Chords • ⭐ ${(bestChords.rating || 0).toFixed(1)} (${bestChords.votes || 0} votes)
              </div>
            `;
            
            let listContainer = links[0];
            while (listContainer.parentElement && listContainer.parentElement.tagName !== 'BODY' && listContainer.parentElement.tagName !== 'MAIN') {
              if (listContainer.parentElement.children.length > 3) {
                listContainer = listContainer.parentElement;
                break;
              }
              listContainer = listContainer.parentElement;
            }
            
            console.log("[Rockstar] Inserting before list container");
            if (listContainer && listContainer.parentElement) {
              listContainer.parentElement.insertBefore(customRow, listContainer);
            } else {
              document.body.insertBefore(customRow, document.body.firstChild);
            }
          }
        }, 500);

      } catch (e) {
        console.error("[Rockstar] Error highlighting best results:", e);
      }
    }, 500);
  }

  function numberSearchResults() {
    if (!window.location.href.includes('search.php') && !window.location.href.includes('search')) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attempts > 20) {
        clearInterval(interval);
        return;
      }

      const allLinks = Array.from(document.querySelectorAll('a'));
      const tabLinks = allLinks.filter(a => a.href.includes('tabs.ultimate-guitar.com/tab/') && !a.href.includes('#'));

      if (tabLinks.length === 0) return;

      clearInterval(interval);
      console.log("[Rockstar] Found tab links for numbering:", tabLinks.length);

      window.ugSearchResultLinks = {};
      let counter = 1;
      const processedUrls = new Set();

      tabLinks.forEach(link => {
        const url = link.href.split('?')[0];
        if (!processedUrls.has(url)) {
          processedUrls.add(url);
          window.ugSearchResultLinks[counter] = url;

          const badge = document.createElement('span');
          badge.innerText = `[${counter}] `;
          badge.style.backgroundColor = '#e91e63';
          badge.style.color = '#fff';
          badge.style.fontWeight = 'bold';
          badge.style.padding = '2px 6px';
          badge.style.borderRadius = '4px';
          badge.style.marginRight = '8px';
          badge.style.fontSize = '14px';
          badge.style.display = 'inline-block';
          
          link.insertBefore(badge, link.firstChild);

          counter++;
        }
      });
    }, 500);
  }

  // Activation Banner Controls
  function showActivationBanner() {
    if (document.getElementById('ug-voice-activation-banner') || bannerEl) return;
    
    bannerEl = document.createElement('div');
    bannerEl.id = 'ug-voice-activation-banner';
    bannerEl.innerHTML = `
      <div class="activation-banner-title">🎸 Rockstar Companion</div>
      <div style="font-size: 13px; line-height: 1.4; color: #eee; margin-top: 4px;">Activer le contrôle vocal et l'accordeur sur ce site ?</div>
      <div class="activation-banner-actions" style="margin-top: 8px;">
        <button class="activation-banner-btn secondary" id="banner-btn-refuse">Ne plus demander</button>
        <button class="activation-banner-btn primary" id="banner-btn-accept">Activer</button>
      </div>
    `;
    document.body.appendChild(bannerEl);
    
    document.getElementById('banner-btn-accept').addEventListener('click', () => {
      chrome.storage.sync.get('allowedDomains', (res) => {
        const allowedDomains = res.allowedDomains || {};
        allowedDomains[currentDomain] = true;
        chrome.storage.sync.set({ allowedDomains }, () => {
          removeActivationBanner();
          initializeRockstar();
        });
      });
    });
    
    document.getElementById('banner-btn-refuse').addEventListener('click', () => {
      chrome.storage.sync.get('allowedDomains', (res) => {
        const allowedDomains = res.allowedDomains || {};
        allowedDomains[currentDomain] = false;
        chrome.storage.sync.set({ allowedDomains }, () => {
          removeActivationBanner();
        });
      });
    });
  }

  function removeActivationBanner() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
    const existing = document.getElementById('ug-voice-activation-banner');
    if (existing) existing.remove();
  }

  // Storage preference listeners and bootstrap check
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord', 'allowedDomains', 'muteAllSites'], (result) => {
      buildChordTemplates(result.chord7th || false, result.chordSus || false);
      if (result.wakeWord !== undefined) {
        wakeWord = result.wakeWord.trim() || 'Rockstar';
        wakeWordLower = wakeWord.toLowerCase();
      }
      
      if (isUG) {
        initializeRockstar();
      } else {
        const allowedDomains = result.allowedDomains || {};
        const muteAllSites = result.muteAllSites || false;
        const status = allowedDomains[currentDomain];
        
        if (status === true) {
          initializeRockstar();
        } else if (status === false || muteAllSites === true) {
          // Explicitly blocked or global mute
        } else {
          showActivationBanner();
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord', 'allowedDomains', 'muteAllSites'], (result) => {
          buildChordTemplates(result.chord7th || false, result.chordSus || false);
          const oldWakeWord = wakeWord;
          wakeWord = (result.wakeWord !== undefined ? result.wakeWord.trim() : 'Rockstar') || 'Rockstar';
          wakeWordLower = wakeWord.toLowerCase();
          
          if (isInitialized && oldWakeWord !== wakeWord) {
            updateUIForWakeWord();
          }

          if (!isUG) {
            const allowedDomains = result.allowedDomains || {};
            const muteAllSites = result.muteAllSites || false;
            const status = allowedDomains[currentDomain];
            
            if (status === true) {
              removeActivationBanner();
              if (!isInitialized) {
                initializeRockstar();
              } else if (btn) {
                btn.style.display = 'flex';
              }
            } else {
              if (status === false || muteAllSites === true) {
                removeActivationBanner();
                if (isInitialized && btn) {
                  stopListening();
                  btn.style.display = 'none';
                }
              } else {
                if (!isInitialized) {
                  showActivationBanner();
                }
              }
            }
          }
        });
      }
    });
  } else {
    buildChordTemplates(false, false);
    if (isUG) {
      initializeRockstar();
    }
  }
}
