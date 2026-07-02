const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.warn("Web Speech API not supported in this browser.");
} else {
  function safeStorageGet(key, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(key, callback);
    } else {
      const val = localStorage.getItem(key);
      let parsed = null;
      if (val !== null) {
        try {
          parsed = JSON.parse(val);
        } catch (e) {
          parsed = val;
        }
      }
      callback({ [key]: parsed });
    }
  }

  function safeStorageSet(obj, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj, callback);
    } else {
      for (const [k, v] of Object.entries(obj)) {
        localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : v);
      }
      if (callback) callback();
    }
  }

  function safeStorageRemove(key, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(key, callback);
    } else {
      localStorage.removeItem(key);
      if (callback) callback();
    }
  }

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
  
  const SITE_CONFIGS = {
    'ultimate-guitar.com': {
      isSearchPage: () => window.location.href.includes('search.php') || window.location.href.includes('search') || window.location.href.includes('explore'),
      getLinks: () => {
        const allLinks = Array.from(document.querySelectorAll('a'));
        return allLinks.filter(a => 
          (a.href.includes('/tab/') || a.href.includes('ultimate-guitar.com/tab/')) && 
          !a.href.includes('#')
        );
      },
      searchUrl: (query) => `https://www.ultimate-guitar.com/search.php?title=${encodeURIComponent(query)}&page=1&type[0]=300&rating[0]=4&rating[1]=5&order=myweight`
    },
    'google.com': {
      isSearchPage: () => window.location.pathname.startsWith('/search'),
      getLinks: () => {
        const results = [];
        document.querySelectorAll('h3').forEach(h3 => {
          let a = h3.closest('a');
          if (!a) {
            a = h3.querySelector('a');
          }
          if (a && a.href && !a.href.includes('google.com/search') && !a.classList.contains('fl')) {
            results.push(a);
          }
        });
        return results;
      },
      searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    },
    'youtube.com': {
      isSearchPage: () => window.location.pathname.startsWith('/results'),
      getLinks: () => {
        const results = [];
        document.querySelectorAll('ytd-video-renderer').forEach(renderer => {
          const a = renderer.querySelector('a#video-title, a#video-title-link, a.yt-simple-endpoint');
          if (a && a.href && a.href.includes('/watch')) {
            results.push(a);
          }
        });
        if (results.length === 0) {
          document.querySelectorAll('a#video-title, a#video-title-link').forEach(a => {
            if (a.href && a.href.includes('/watch')) {
              results.push(a);
            }
          });
        }
        const seen = new Set();
        const uniqueResults = [];
        results.forEach(a => {
          const cleanHref = a.href.split('&')[0];
          if (!seen.has(cleanHref)) {
            seen.add(cleanHref);
            uniqueResults.push(a);
          }
        });
        return uniqueResults;
      },
      searchUrl: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    },
    'default': {
      isSearchPage: () => window.location.href.includes('search') || window.location.href.includes('query') || window.location.href.includes('q='),
      getLinks: () => {
        const candidateLinks = [];
        const seenUrls = new Set();
        document.querySelectorAll('h1 a, h2 a, h3 a, h4 a, .result a, .item a').forEach(a => {
          if (a.href && !a.href.startsWith('javascript:') && !a.href.includes('#') && a.innerText.trim().length > 5) {
            const cleanUrl = a.href.split('?')[0];
            if (!seenUrls.has(cleanUrl)) {
              seenUrls.add(cleanUrl);
              candidateLinks.push(a);
            }
          }
        });
        return candidateLinks.slice(0, 30);
      },
      searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    }
  };

  const activeSiteKey = Object.keys(SITE_CONFIGS).find(domain => currentDomain.endsWith(domain)) || 'default';
  const activeConfig = SITE_CONFIGS[activeSiteKey];
  
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
  
  let commandsBtn = null;
  let commandsPanel = null;
  
  let markersWrapper = null;
  let markersBtn = null;
  let markersPanel = null;
  let lastDrawnVideoId = null;
  let lastAccessedBookmarkTime = null;
  let lastAccessedBookmarkName = null;
  
  let feedbackContainer = null;
  let liveTextContainer = null;
  let speedContainer = null;
  let bannerEl = null;
  
  let isInitialized = false;
  let isSuspendedByVisibility = false;
  let recognition = null;
  let interimFinalizeTimeout = null;
  let lastInterimTranscript = '';

  let drawerBtn = null;
  let drawerContainer = null;
  let currentSong = null;
  let activeDrawerPlaybackLink = null;
  let dictationRecognition = null;
  let activeDictationTarget = null;
  let activeDictationBtn = null;
  let isDrawerInitialized = false;

  let audioContext = null;
  let analyser = null;
  let tunerActive = false;
  let pitchHistory = [];
  let chordHistory = [];
  let chordClearTimeout = null;
  const freqBuf = new Float32Array(8192);

  // Metronome variables
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

  function initTuner() {
    const unlockAudioContext = () => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          if (audioContext.state === 'running') {
            console.log("[Rockstar] AudioContext resumed on user gesture");
            window.removeEventListener('click', unlockAudioContext);
            window.removeEventListener('keydown', unlockAudioContext);
            window.removeEventListener('touchstart', unlockAudioContext);
          }
        }).catch(err => {
          console.error("[Rockstar] Failed to resume AudioContext", err);
        });
      } else if (audioContext && audioContext.state === 'running') {
        window.removeEventListener('click', unlockAudioContext);
        window.removeEventListener('keydown', unlockAudioContext);
        window.removeEventListener('touchstart', unlockAudioContext);
      }
    };

    if (audioContext) {
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          if (audioContext.state === 'suspended') {
            window.addEventListener('click', unlockAudioContext);
            window.addEventListener('keydown', unlockAudioContext);
            window.addEventListener('touchstart', unlockAudioContext);
          }
        }).catch(err => {
          console.error("[Rockstar] Failed to resume on initTuner", err);
          window.addEventListener('click', unlockAudioContext);
          window.addEventListener('keydown', unlockAudioContext);
          window.addEventListener('touchstart', unlockAudioContext);
        });
      }
      tunerContainer.classList.add('visible');
      chordContainer.classList.add('visible');
      if (metronomeContainer) metronomeContainer.classList.add('visible');
      if (metronomeFlashScreen) createScreenFlashOverlay();
      tunerActive = true;
      updateTuner();
      return;
    }
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 16384;

    window.addEventListener('click', unlockAudioContext);
    window.addEventListener('keydown', unlockAudioContext);
    window.addEventListener('touchstart', unlockAudioContext);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      tunerActive = true;
      tunerContainer.classList.add('visible');
      chordContainer.classList.add('visible');
      if (metronomeContainer) metronomeContainer.classList.add('visible');
      if (metronomeFlashScreen) createScreenFlashOverlay();
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

  // Metronome Scheduler and Helpers
  function startMetronome() {
    if (metronomePlaying) return;
    
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
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

  let commandsWrapper = null;

  function getOrCreateFloatingBar() {
    let bar = document.getElementById('rockstar-floating-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rockstar-floating-bar';
      document.body.appendChild(bar);
    }
    return bar;
  }

  function appendButtonsToFloatingBar() {
    const bar = getOrCreateFloatingBar();
    if (commandsWrapper) bar.appendChild(commandsWrapper);
    else if (commandsBtn) bar.appendChild(commandsBtn);
    
    if (markersWrapper) bar.appendChild(markersWrapper);
    
    if (btn) bar.appendChild(btn);
    if (drawerBtn) bar.appendChild(drawerBtn);
  }

  function initializeRockstar() {
    if (isInitialized) return;
    isInitialized = true;

    // Ensure Drawer is initialized first
    initializeDrawer();

    recognition = new SpeechRecognition();
    recognition.continuous = false;
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

    // Create metronome UI elements
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

    // Create floating commands button and panel wrapper
    commandsWrapper = document.createElement('div');
    commandsWrapper.className = 'rockstar-commands-wrapper';

    commandsBtn = document.createElement('button');
    commandsBtn.id = 'ug-commands-btn';
    commandsBtn.innerText = '📋';
    commandsBtn.title = 'Afficher les commandes disponibles';
    commandsWrapper.appendChild(commandsBtn);

    commandsPanel = document.createElement('div');
    commandsPanel.id = 'ug-commands-panel';
    commandsWrapper.appendChild(commandsPanel);

    const isYouTube = window.location.hostname.includes('youtube.com');
    if (isYouTube) {
      createMarkersUI();
    }

    // Append all three buttons to the floating bar in the correct order
    appendButtonsToFloatingBar();

    function updateCommandsPanel() {
      const isYouTube = window.location.hostname.includes('youtube.com');
      let title = "Commandes Rockstar";
      let listItems = [];
      
      if (isYouTube) {
        title = "📹 Commandes YouTube";
        listItems = [
          { label: "▶️ Lecture / Play", cmd: "lecture" },
          { label: "⏸️ Pause / Stop", cmd: "pause" },
          { label: "↩️ Reculer 10s", cmd: "recule" },
          { label: "↪️ Avancer 10s", cmd: "avance" },
          { label: "🔄 Recommencer", cmd: "recommence" },
          { label: "⚡ Vitesse 0.75x", cmd: "vitesse 0.75" },
          { label: "⚡ Vitesse 1.25x", cmd: "vitesse 1.25" },
          { label: "⚡ Vitesse Normale", cmd: "vitesse normale" },
          { label: "📍 Poser Repère 1", cmd: "enregistre le repère 1" },
          { label: "📍 Poser Repère 2", cmd: "enregistre le repère 2" },
          { label: "➡️ Aller Repère 1", cmd: "retourne au repère 1" },
          { label: "➡️ Aller Repère 2", cmd: "retourne au repère 2" },
          { label: "⏱️ Démarrer Métronome", cmd: "démarre le métronome" },
          { label: "⏱️ Arrêter Métronome", cmd: "arrête le métronome" }
        ];
      } else {
        title = "🎸 Commandes Tablature";
        listItems = [
          { label: "⬇️ Défiler vers le bas", cmd: "défile" },
          { label: "⏸️ Pause Scroll", cmd: "pause" },
          { label: "🔝 Retour en haut", cmd: "go to top" },
          { label: "🔽 Descendre un peu", cmd: "descends un peu" },
          { label: "🔼 Monter un peu", cmd: "monte un peu" },
          { label: "⚡ Défiler plus vite", cmd: "plus vite" },
          { label: "⚡ Défiler plus lent", cmd: "moins vite" },
          { label: "⏱️ Démarrer Métronome", cmd: "démarre le métronome" },
          { label: "⏱️ Arrêter Métronome", cmd: "arrête le métronome" },
          { label: "💤 Mettre en veille", cmd: "dors" }
        ];
      }
      
      commandsPanel.innerHTML = `
        <div class="commands-panel-header">${title}</div>
        <div class="commands-panel-body">
          ${listItems.map(item => `<button class="command-item" data-cmd="${item.cmd}">${item.label}</button>`).join('')}
        </div>
      `;
      
      commandsPanel.querySelectorAll('.command-item').forEach(button => {
        button.addEventListener('click', (e) => {
          const cmdText = button.getAttribute('data-cmd');
          if (cmdText) {
            wakeUp(15000, false);
            handleCommand(cmdText);
          }
        });
      });
    }

    // Expose it so it can be updated externally (e.g. on route transitions)
    window.updateCommandsPanel = updateCommandsPanel;
    updateCommandsPanel();

    commandsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = commandsPanel.classList.toggle('visible');
      if (isVisible && markersPanel) {
        markersPanel.classList.remove('visible');
      }
    });

    document.addEventListener('click', () => {
      if (commandsPanel) {
        commandsPanel.classList.remove('visible');
      }
      if (markersPanel) {
        markersPanel.classList.remove('visible');
      }
    });
    
    commandsPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

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
      clearTimeout(interimFinalizeTimeout);
      
      function normalize(text) {
        let normalized = text.toLowerCase()
                   .replace(/[\u2019’]/g, "'")
                   .replace(/-/g, ' ')
                   .trim()
                   .replace(/\b(?:repair|reap here|repare|repaire|re\s+père|re-père)\b/g, 'repère');
        
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

        let activeText = normalized;
        if (normalized.includes(wakeWordLower)) {
          const wakeIndex = normalized.lastIndexOf(wakeWordLower);
          activeText = normalized.substring(wakeIndex + wakeWordLower.length).trim();
        }

        if (isAwake || normalized.includes(wakeWordLower)) {
          const now = Date.now();
          if (now - lastSpeedChange > 500) {
            let changed = false;
            
            const speedSetRegex = new RegExp("(?:vitesse|speed|niveau|level)\\s*(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "\\b", "i");
            const speedSetMatch = activeText.match(speedSetRegex);
            
            if (speedSetMatch) {
               const val = textToNum[speedSetMatch[1].toLowerCase()];
               if (val) {
                 setSpeed(val);
                 changed = true;
               }
            } else if (speedUpVariants.some(v => activeText.includes(v))) {
               adjustSpeed(1);
               changed = true;
            } else if (slowDownVariants.some(v => activeText.includes(v))) {
               adjustSpeed(-1);
               changed = true;
            }
            if (changed) {
               lastSpeedChange = now;
               showFeedback(`⚡ Speed Level ${scrollSpeed}`, true);
               wakeUp(15000, false);
               recognition.stop();
               return;
            }
          }
        }
        
        if (event.results[i].isFinal) {
          clearTimeout(interimFinalizeTimeout);
          lastInterimTranscript = '';
          let finalTranscript = activeText;
          console.log("Voice Command Recognized:", finalTranscript);
          liveTextContainer.innerText = '';
          liveTextContainer.style.display = 'none';

          if (normalized.includes(wakeWordLower)) {
            if (finalTranscript.length > 0) {
              const success = handleCommand(finalTranscript);
              if (success) {
                wakeUp(5000, false);
              } else {
                if (finalTranscript.split(/\s+/).length > 3) {
                  goToSleep();
                } else {
                  wakeUp(5000, false);
                }
              }
            } else {
              wakeUp(7000, true);
            }
          } else if (isAwake) {
            const success = handleCommand(finalTranscript);
            if (success) {
              wakeUp(5000, false);
            } else {
              if (finalTranscript.split(/\s+/).length > 3) {
                goToSleep();
              } else {
                wakeUp(3000, false);
              }
            }
          } else {
            console.log("Ignored (sleeping):", normalized);
          }
          
          // Force reset of speech recognition engine to clear buffers
          try {
            recognition.stop();
          } catch (e) {}
        } else {
          interimRaw += transcript + ' ';
          let activeInterim = normalized;
          if (normalized.includes(wakeWordLower)) {
            const wakeIndex = normalized.lastIndexOf(wakeWordLower);
            activeInterim = normalized.substring(wakeIndex + wakeWordLower.length).trim();
          }
          lastInterimTranscript = activeInterim;
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
          let displayInterim = normalizedInterim;
          if (normalizedInterim.includes(wakeWordLower)) {
            const wakeIndex = normalizedInterim.lastIndexOf(wakeWordLower);
            displayInterim = normalizedInterim.substring(wakeIndex).trim();
          }
          liveTextContainer.innerText = displayInterim;
          liveTextContainer.style.display = 'block';
        }
      }

      // Start silence finalize timeout if we have pending interim transcript and are awake
      if (isAwake && lastInterimTranscript.trim() !== '') {
        interimFinalizeTimeout = setTimeout(() => {
          console.log("[Rockstar] Auto-finalizing interim speech:", lastInterimTranscript);
          const transcriptToExecute = lastInterimTranscript;
          lastInterimTranscript = '';
          liveTextContainer.innerText = '';
          liveTextContainer.style.display = 'none';
          
          wakeUp(15000, false);
          handleCommand(transcriptToExecute);
        }, 1200);
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
    safeStorageGet('rockstar_awake_until', (res) => {
      const now = Date.now();
      if (res.rockstar_awake_until && res.rockstar_awake_until > now) {
        isAwake = true;
      }
      startListening(true);
    });
    
    if (isUG) {
      highlightBestResults();
    }
    numberSearchResults();

    // Mutation observer to handle SPA routing / dynamic DOM updates on search pages
    let lastUrl = window.location.href;
    const searchObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      const isSearchPage = activeConfig.isSearchPage();
      
      if (isSearchPage) {
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          if (typeof updateCommandsPanel === 'function') {
            updateCommandsPanel();
          }
          if (isUG) {
            // Clear old highlighted classes & custom best row
            document.querySelectorAll('.ug-voice-highlighted-row').forEach(row => {
              row.classList.remove('ug-voice-highlighted-row');
            });
            const customRow = document.getElementById('ug-voice-custom-best-row');
            if (customRow) customRow.remove();
            
            highlightBestResults();
          }
          numberSearchResults();
        } else {
          // Check if there are unnumbered links in the DOM
          const tabLinks = activeConfig.getLinks();
          const hasUnnumbered = tabLinks.some(link => !link.querySelector('.ug-result-badge'));
          if (hasUnnumbered && tabLinks.length > 0) {
            numberSearchResults();
          }
        }
      } else {
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          if (typeof updateCommandsPanel === 'function') {
            updateCommandsPanel();
          }
        }
      }
    });
    searchObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    if (window.location.hostname.includes('youtube.com')) {
      setInterval(() => {
        const currentVideoId = getCurrentYouTubeVideoId();
        const progressBar = document.querySelector('.ytp-progress-bar');
        const hasIdChanged = currentVideoId !== lastDrawnVideoId;
        if (progressBar && (!progressBar.querySelector('.rockstar-marker') || hasIdChanged)) {
          drawVisualMarkers();
        }
        if (hasIdChanged && markersPanel && markersPanel.classList.contains('visible')) {
          updateMarkersPanelList();
        }

        // Enforce controls visibility setting
        const isForced = localStorage.getItem('rockstar_always_show_controls') === 'true';
        const player = document.querySelector('.html5-video-player');
        if (player) {
          player.classList.toggle('rockstar-force-controls-visible', isForced);
        }
      }, 2000);
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
        if (isAwake) {
          safeStorageGet('rockstar_awake_until', (res) => {
            const now = Date.now();
            const remaining = res.rockstar_awake_until ? (res.rockstar_awake_until - now) : 15000;
            if (remaining > 0) {
              wakeUp(remaining, false);
            } else {
              goToSleep();
            }
          });
        } else {
          updateUIForWakeWord();
        }
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
        if (metronomeContainer) {
          metronomeContainer.classList.remove('visible', 'flash-active', 'flash-accent');
          stopMetronome();
        }
        removeScreenFlashOverlay();
       if (audioContext && audioContext.state === 'running') {
          audioContext.suspend();
       }
    }
    try {
      recognition.stop();
    } catch (e) { }
    isAwake = false;
    safeStorageRemove('rockstar_awake_until');
    if (btn) {
      btn.classList.remove('listening', 'awake');
      statusSpan.innerText = 'Off';
      btn.title = 'Voice control OFF. Click to enable';
    }
    stopScrolling();
  }

  function wakeUp(timeoutMs = 15000, showToast = true) {
    isAwake = true;
    const awakeUntil = Date.now() + timeoutMs;
    safeStorageSet({ rockstar_awake_until: awakeUntil });
    if (btn) btn.classList.add('awake');
    if (statusSpan) statusSpan.innerText = "À l'écoute";
    
    if (showToast) {
      showFeedback(`🎸 ${wakeWord} is listening...`, true);
    }
    
    clearTimeout(awakeTimeout);
    awakeTimeout = setTimeout(() => {
      goToSleep();
    }, timeoutMs);
  }

  function goToSleep() {
    isAwake = false;
    safeStorageRemove('rockstar_awake_until');
    if (btn) btn.classList.remove('awake');
    if (statusSpan) statusSpan.innerText = 'Veille';
    showFeedback(`💤 ${wakeWord} is sleeping...`, true);
  }

  function sendYouTubeCommand(func, args = []) {
    const iframe = drawerContainer.querySelector('#drawer-youtube-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), '*');
    }
  }

  function getActiveVideo() {
    // 1. Direct <video> element on the main page (e.g. youtube.com)
    const video = document.querySelector('video');
    if (video) return video;
    
    // 2. Look inside iframes (if accessible)
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const v = doc.querySelector('video');
        if (v) return v;
      } catch (e) {
        // Cross-origin iframe, ignore
      }
    }
    return null;
  }

  function getBookmarksStorageKey() {
    if (window.location.hostname.includes('youtube.com')) {
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');
      if (videoId) {
        return `rockstar_bookmarks_yt_${videoId}`;
      }
    }
    const cleanUrl = window.location.href.split('?')[0].split('#')[0];
    return `rockstar_bookmarks_${cleanUrl}`;
  }

  function normalizeBookmarkName(name) {
    const trimmed = name.trim().toLowerCase();
    if (textToNum[trimmed] !== undefined) {
      return String(textToNum[trimmed]);
    }
    return trimmed;
  }

  function findBookmarkTimeAndName(searchName, bookmarks) {
    const normSearch = normalizeBookmarkName(searchName).trim().toLowerCase();
    const entries = Object.entries(bookmarks);
    
    // Sort entries chronologically by time
    entries.sort((a, b) => a[1] - b[1]);

    // 1. Chronological index match (1-based)
    // If normSearch is a positive integer (like "1" or "2"), check if it fits the index range
    const isNum = /^\d+$/.test(normSearch);
    if (isNum) {
      const index = parseInt(normSearch, 10) - 1;
      if (index >= 0 && index < entries.length) {
        return { name: entries[index][0], time: entries[index][1] };
      }
    }

    // 2. Exact match
    for (const [name, time] of entries) {
      if (normalizeBookmarkName(name).trim().toLowerCase() === normSearch) {
        return { name, time };
      }
    }
    
    // 3. Prefix match if searchName is a number
    if (isNum) {
      for (const [name, time] of entries) {
        const nameNorm = normalizeBookmarkName(name).trim().toLowerCase();
        const numPrefixRegex = new RegExp('^' + normSearch + '(?:\\b|[^0-9])');
        if (numPrefixRegex.test(nameNorm)) {
          return { name, time };
        }
      }
    }
    
    // 4. Substring match
    for (const [name, time] of entries) {
      const nameNorm = normalizeBookmarkName(name).trim().toLowerCase();
      if (nameNorm.includes(normSearch)) {
        return { name, time };
      }
    }
    
    return null;
  }

  function getCurrentYouTubeVideoId() {
    if (window.location.hostname.includes('youtube.com')) {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v') || null;
    }
    return null;
  }

  function drawVisualMarkers(force = false) {
    const video = getActiveVideo();
    if (!video || !video.duration) return;

    const progressBar = document.querySelector('.ytp-progress-bar');
    if (!progressBar) return;

    const currentVideoId = getCurrentYouTubeVideoId();
    if (currentVideoId !== lastDrawnVideoId || force) {
      progressBar.querySelectorAll('.rockstar-marker').forEach(m => m.remove());
      lastDrawnVideoId = currentVideoId;
    } else if (progressBar.querySelector('.rockstar-marker')) {
      return;
    }

    const key = getBookmarksStorageKey();
    safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      const entries = Object.entries(bookmarks);
      // Sort chronologically by time
      entries.sort((a, b) => a[1] - b[1]);

      entries.forEach(([name, time], idx) => {
        const pct = (time / video.duration) * 100;
        
        const marker = document.createElement('div');
        marker.className = 'rockstar-marker';
        marker.style.left = `${pct}%`;
        marker.title = `Repère ${idx + 1}: ${name}`;
        
        // 1. Yellow/orange marker line
        const markerLine = document.createElement('div');
        markerLine.className = 'rockstar-marker-line';
        marker.appendChild(markerLine);
        
        // 2. Floating text label
        const markerLabel = document.createElement('div');
        markerLabel.className = 'rockstar-marker-label';
        const isPureNum = /^\d+$/.test(name);
        markerLabel.innerText = isPureNum ? name : `${idx + 1}. ${name}`;
        marker.appendChild(markerLabel);
        
        marker.addEventListener('click', (e) => {
          e.stopPropagation();
          video.currentTime = time;
          lastAccessedBookmarkTime = time;
          lastAccessedBookmarkName = name;
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60).toString().padStart(2, '0');
          showFeedback(`➡️ Saut vers Repère "${name}" (${minutes}:${seconds})`, true);
        });
        
        progressBar.appendChild(marker);
      });
    });
  }

  function createMarkersUI() {
    if (document.getElementById('rockstar-markers-panel') || document.getElementById('rockstar-markers-btn')) return;

    markersWrapper = document.createElement('div');
    markersWrapper.className = 'rockstar-markers-wrapper';

    markersBtn = document.createElement('button');
    markersBtn.id = 'rockstar-markers-btn';
    markersBtn.innerText = '📍';
    markersBtn.title = 'Afficher les repères de lecture';
    markersWrapper.appendChild(markersBtn);

    markersPanel = document.createElement('div');
    markersPanel.id = 'rockstar-markers-panel';
    
    markersPanel.innerHTML = `
      <div class="markers-panel-header">
        <span>📍 Repères YouTube</span>
      </div>
      <div class="markers-panel-body">
        <button class="rockstar-add-marker-btn">➕ Poser un repère</button>
        <label class="rockstar-toggle-option">
          <input type="checkbox" id="rockstar-toggle-force-controls" />
          <span>Afficher la barre de navigation</span>
        </label>
        <div class="markers-panel-list"></div>
      </div>
    `;
    markersWrapper.appendChild(markersPanel);

    // Toggle panel
    markersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = markersPanel.classList.toggle('visible');
      if (isVisible) {
        // Hide commands panel
        if (commandsPanel) commandsPanel.classList.remove('visible');
        updateMarkersPanelList();
      }
    });

    markersPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Close panel on clicking outside
    document.addEventListener('click', () => {
      if (markersPanel) {
        markersPanel.classList.remove('visible');
      }
    });

    // Wire up Toggle Controls Visibility checkbox
    const toggleForceControls = markersPanel.querySelector('#rockstar-toggle-force-controls');
    const isForced = localStorage.getItem('rockstar_always_show_controls') === 'true';
    toggleForceControls.checked = isForced;
    
    toggleForceControls.addEventListener('change', () => {
      const active = toggleForceControls.checked;
      localStorage.setItem('rockstar_always_show_controls', active);
      
      const player = document.querySelector('.html5-video-player');
      if (player) {
        player.classList.toggle('rockstar-force-controls-visible', active);
      }
    });

    // Wire up Add button
    const addBtn = markersPanel.querySelector('.rockstar-add-marker-btn');
    addBtn.addEventListener('click', () => {
      const video = getActiveVideo();
      if (!video) {
        showFeedback("❌ Aucun lecteur vidéo actif", false);
        return;
      }
      const time = video.currentTime;
      const key = getBookmarksStorageKey();
      
      safeStorageGet(key, (res) => {
        const bookmarks = res[key] || {};
        
        // Find next available numeric name
        let defaultName = "";
        let i = 1;
        while (true) {
          const nameToCheck = String(i);
          if (bookmarks[nameToCheck] === undefined) {
            defaultName = nameToCheck;
            break;
          }
          i++;
        }
        
        saveBookmark(defaultName, time, () => {
          updateMarkersPanelList();
        });
      });
    });
  }

  function updateMarkersPanelList() {
    if (!markersPanel) return;
    const listContainer = markersPanel.querySelector('.markers-panel-list');
    if (!listContainer) return;

    const key = getBookmarksStorageKey();
    safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      listContainer.innerHTML = '';

      const entries = Object.entries(bookmarks);
      if (entries.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'markers-empty-msg';
        emptyMsg.innerText = 'Aucun repère. Utilisez la voix ou cliquez sur "+" pour en ajouter.';
        listContainer.appendChild(emptyMsg);
        return;
      }

      // Sort chronologically by time
      entries.sort((a, b) => a[1] - b[1]);

      entries.forEach(([name, time], idx) => {
        const item = document.createElement('div');
        item.className = 'rockstar-marker-item';

        const numSpan = document.createElement('span');
        numSpan.className = 'rockstar-marker-num';
        numSpan.innerText = `${idx + 1}.`;
        item.appendChild(numSpan);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'rockstar-marker-name-input';
        nameInput.value = name;
        nameInput.title = 'Cliquez pour renommer';

        // Rename on change/blur/Enter
        const commitRename = () => {
          const newName = nameInput.value.trim();
          if (!newName) {
            nameInput.value = name;
            return;
          }
          if (newName === name) return;

          safeStorageGet(key, (resCurrent) => {
            const currentBookmarks = resCurrent[key] || {};
            // Delete old entry and write new
            const markerTime = currentBookmarks[name];
            delete currentBookmarks[name];
            currentBookmarks[newName] = markerTime !== undefined ? markerTime : time;

            const setObj = { [key]: currentBookmarks };
            safeStorageSet(setObj, () => {
              showFeedback(`✏️ Repère renommé en "${newName}"`, true);
              drawVisualMarkers(true);
              updateMarkersPanelList();
            });
          });
        };

        nameInput.addEventListener('blur', commitRename);
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            nameInput.blur();
          }
        });

        // Time format
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        const timeBtn = document.createElement('button');
        timeBtn.className = 'rockstar-marker-time-btn';
        timeBtn.innerText = `${minutes}:${seconds}`;
        timeBtn.title = 'Aller à ce repère';

        timeBtn.addEventListener('click', () => {
          const video = getActiveVideo();
          if (video) {
            video.currentTime = time;
            lastAccessedBookmarkTime = time;
            lastAccessedBookmarkName = nameInput.value;
            showFeedback(`➡️ Saut vers Repère "${nameInput.value}" (${minutes}:${seconds})`, true);
          }
        });

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'rockstar-marker-delete-btn';
        deleteBtn.innerText = '🗑️';
        deleteBtn.title = 'Supprimer le repère';

        deleteBtn.addEventListener('click', () => {
          safeStorageGet(key, (resCurrent) => {
            const currentBookmarks = resCurrent[key] || {};
            delete currentBookmarks[name];

            const setObj = { [key]: currentBookmarks };
            safeStorageSet(setObj, () => {
              showFeedback(`❌ Repère "${name}" supprimé`, true);
              drawVisualMarkers(true);
              updateMarkersPanelList();
            });
          });
        });

        item.appendChild(nameInput);
        item.appendChild(timeBtn);
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
      });
    });
  }

  function saveBookmark(name, time, callback) {
    const key = getBookmarksStorageKey();
    const normName = normalizeBookmarkName(name);
    
    safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      bookmarks[normName] = time;
      
      const setObj = { [key]: bookmarks };
      safeStorageSet(setObj, () => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        showFeedback(`📍 Repère "${name}" enregistré à ${minutes}:${seconds}`, true);
        
        // Redraw visual markers on progress bar (force it)
        drawVisualMarkers(true);
        
        // Update markers list panel if active
        if (typeof updateMarkersPanelList === 'function') {
          updateMarkersPanelList();
        }
        
        if (callback) callback();
      });
    });
  }

  function loadBookmark(name) {
    const key = getBookmarksStorageKey();
    
    safeStorageGet(key, (res) => {
      const bookmarks = res[key] || {};
      const match = findBookmarkTimeAndName(name, bookmarks);
      if (match) {
        const { name: matchedName, time } = match;
        
        // Track last accessed bookmark
        lastAccessedBookmarkTime = time;
        lastAccessedBookmarkName = matchedName;
        
        const video = getActiveVideo();
        if (video) {
          video.currentTime = time;
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60).toString().padStart(2, '0');
          showFeedback(`➡️ Saut vers Repère "${matchedName}" (${minutes}:${seconds})`, true);
        } else if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
          sendYouTubeCommand('seekTo', [time, true]);
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60).toString().padStart(2, '0');
          showFeedback(`➡️ Saut vers Repère "${matchedName}" (${minutes}:${seconds})`, true);
        } else {
          showFeedback(`❌ Aucun lecteur vidéo actif`, false);
        }
      } else {
        showFeedback(`❌ Repère "${name}" introuvable`, false);
      }
    });
  }

  function hasWord(phrase, word) {
    const normalizeWord = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
    const target = normalizeWord(word.toLowerCase().trim());
    const words = phrase.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/);
    return words.some(w => normalizeWord(w) === target);
  }

  function handleCommand(command) {
    let action = '';
    let isSuccess = true;
    const cmd = command.toLowerCase().trim();

    // Playback control variants
    const playPlaybackVariants = ['play', 'lecture', 'joue', 'lancer', 'démarrer', 'commence', 'joue la chanson', 'resume', 'start music', 'play song', 'reprends', 'reprendre', 'jouer', 'unpause'];
    const pausePlaybackVariants = ['pause', 'pose', 'stop scroll', 'arrête le scroll', 'arrete le scroll', 'fige', 'bloque', 'suspend', 'stop', 'arrête', 'arrete', 'arrêt', 'arret', 'stoppe', 'stopper', 'stopp', 'pause la musique', 'pause music'];
    const rewindPlaybackVariants = ['recule', 'retour', 'rewind', 'go back', 'back', 'arrière', 'arriere', 'recule de dix secondes', 'recule de 10 secondes'];
    const restartPlaybackVariants = ['recommence', 'restart', 'recommencer', 'remets au début', 'remets au debut', 'restart song'];

    // Scroll control variants (cleaned from playback conflicts)
    const scrollDownVariants = ['scroll down', 'en bas', 'plus bas', 'go down', 'down', 'bas', 'c\'est parti', 'c’est parti', 'défile', 'défiler', 'dé file', 'dé filer', 'des files', 'des file', 'dé fil', 'des fil', 'défilement', 'glisse', 'glisser'];
    
    // Discrete scroll control variants
    const scrollDownSmallVariants = ['descends', 'dessein', 'descends un peu', 'descendre un peu', 'un peu plus bas', 'petite descente', 'scroll down a bit', 'scroll down a little', 'down a little', 'down a bit'];
    const scrollDownLargeVariants = ['descends beaucoup', 'descendre beaucoup', 'beaucoup plus bas', 'grande descente', 'scroll down a lot', 'down a lot', 'scroll down page'];
    const scrollUpSmallVariants = ['remonte', 'monte un peu', 'monter un peu', 'remonte un peu', 'remonter un peu', 'un peu plus haut', 'petite montée', 'petite montee', 'scroll up a bit', 'scroll up a little', 'up a little', 'up a bit'];
    const scrollUpLargeVariants = ['monte beaucoup', 'monter beaucoup', 'remonte beaucoup', 'remonter beaucoup', 'beaucoup plus haut', 'grande montée', 'grande montee', 'scroll up a lot', 'up a lot', 'scroll up page'];

    const sleepVariants = ['dors', 'endors', 'sleep', 'merci', 'c\'est tout'];
    const topVariants = ['début', 'debut', 'tout en haut', 'go to top', 'top', 'reviens', 'commencement'];
    const searchPlaylistPrefixes = [
      'playlist search ', 'search playlist ', 
      'cherche dans ma playlist ', 'chercher dans ma playlist ', 'cherche dans mes playlists ', 'chercher dans mes playlists ',
      'cherche playlist ', 'chercher playlist ',
      'trouve dans ma playlist ', 'trouver dans ma playlist ', 'trouve dans mes playlists ', 'trouver dans mes playlists '
    ];
    const searchPrefixes = ['search for ', 'search ', 'cherche ', 'chercher ', 'trouve ', 'trouver ', 'find '];

    const repeatVariants = ['encore', 'a nouveau', 'à nouveau', 'rejoue', 'rejouer', 'repete', 'répète', 'répéter', 'repeter', 'again', 'repeat', 'once more', 'one more time'];
    const openNumRegex = new RegExp("^(?:ouvre|open|go to|choisis|prends|lance)?\\s*(?:le\\s+|la\\s+|the\\s+)?(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "$", "i");
    const numMatch = cmd.match(openNumRegex);

    const videoSpeedRegex = /^(?:vitesse|playback speed|playbackrate)\s*(?:de\s+)?(\d+(?:[.,]\d+)?|normale|normal)$/i;
    const saveBookmarkRegex = /^(?:enregistre[s]?|place[s]?|placer|sauvegarde[s]?|ajouter|marquer)\s+(?:le\s+)?(?:repère|repere|signet|bookmark)\s+(.+)$/i;
    const loadBookmarkRegex = /^(?:va\s+au|retourne[s]?\s+au|reviens[s]?\s+au|charger|go\s+to)?\s*(?:le\s+)?(?:repère|repere|signet|bookmark)\s+(.+)$/i;
    const rewindRegex = /^(?:recule[s]?|retourne[s]?|rewind|back|arrière|arriere)\s*(?:de\s+)?(\d+|dix|dis|ten|neuf|nine|huit|oui|eight|sept|set|seven|six|sis|cinq|sync|five|quatre|cat|four|for|trois|toi|three|tree|deux|de|two|to|un|in|one)?\s*(?:seconde|secondes|seconds|second)?$/i;
    const forwardRegex = /^(?:avance[s]?|forward|skip)\s*(?:de\s+)?(\d+|dix|dis|ten|neuf|nine|huit|oui|eight|sept|set|seven|six|sis|cinq|sync|five|quatre|cat|four|for|trois|toi|three|tree|deux|de|two|to|un|in|one)?\s*(?:seconde|secondes|seconds|second)?$/i;

    const videoSpeedMatch = cmd.match(videoSpeedRegex);
    const saveBookmarkMatch = cmd.match(saveBookmarkRegex);
    const loadBookmarkMatch = cmd.match(loadBookmarkRegex);
    const rewindMatch = cmd.match(rewindRegex);
    const forwardMatch = cmd.match(forwardRegex);

    // Metronome command variants and regexes
    const metronomeStartVariants = ['démarre le métronome', 'demarre le metronome', 'active le métronome', 'active le metronome', 'joue le métronome', 'joue le metronome', 'metronome play', 'metronome start', 'lance le métronome', 'lance le metronome', 'start metronome', 'play metronome'];
    const metronomeStopVariants = ['arrête le métronome', 'arrete le metronome', 'coupe le métronome', 'coupe le metronome', 'stop le métronome', 'stop le metronome', 'metronome stop', 'metronome pause', 'stop metronome', 'pause metronome'];
    const metronomeTempoRegex = /^(?:tempo|métronome tempo|metronome tempo|vitesse du métronome|vitesse du metronome|bpm)\s*(?:à|a|de\s+)?(\d{2,3})$/i;
    const metronomeMeasureRegex = /^(?:mesure|signature|time signature)\s*(4\s*4|4\/4|3\s*4|3\/4|2\s*4|2\/4|6\s*8|6\/8|1\s*4|1\/4|sans\s+accent|pas\s+d'accent|pas\s+d’accent)$/i;
    const metronomeSoundRegex = /^(?:son|bruit|type de son|metronome sound|sound)\s*(bois|wood|digital|numérique|numerique|tambour|drum)$/i;
    const metronomeVolumeRegex = /^(?:volume|volume du métronome|volume du metronome|metronome volume)\s*(?:à|a|de\s+)?(\d{1,3})%?$/i;
    const metronomeOptWidgetRegex = /^(?:clignote[r]?\s+(?:le\s+)?widget|metronome flash card|flash card|flash widget)$/i;
    const metronomeOptScreenRegex = /^(?:clignote[r]?\s+(?:l'|l’)?écran|clignote[r]?\s+(?:l'|l’)?ecran|metronome flash screen|flash screen)$/i;

    const metronomeTempoMatch = cmd.match(metronomeTempoRegex);
    const metronomeMeasureMatch = cmd.match(metronomeMeasureRegex);
    const metronomeSoundMatch = cmd.match(metronomeSoundRegex);
    const metronomeVolumeMatch = cmd.match(metronomeVolumeRegex);
    const metronomeOptWidgetMatch = cmd.match(metronomeOptWidgetRegex);
    const metronomeOptScreenMatch = cmd.match(metronomeOptScreenRegex);

    if (metronomeStartVariants.some(v => cmd === v || hasWord(cmd, v))) {
      startMetronome();
      action = 'Démarrage du métronome';
    } else if (metronomeStopVariants.some(v => cmd === v || hasWord(cmd, v))) {
      stopMetronome();
      action = 'Arrêt du métronome';
    } else if (metronomeTempoMatch) {
      const bpm = parseInt(metronomeTempoMatch[1], 10);
      if (bpm >= 40 && bpm <= 240) {
        setMetronomeBpm(bpm);
        action = `Tempo réglé à ${bpm} BPM`;
      } else {
        isSuccess = false;
        action = `Tempo invalide (40-240): ${bpm}`;
      }
    } else if (metronomeMeasureMatch) {
      const rawMeasure = metronomeMeasureMatch[1];
      const success = setMetronomeTimeSignature(rawMeasure);
      if (success) {
        action = `Mesure réglée sur ${metronomeTimeSignature}`;
      } else {
        isSuccess = false;
        action = `Mesure invalide: ${rawMeasure}`;
      }
    } else if (metronomeSoundMatch) {
      const rawSound = metronomeSoundMatch[1].toLowerCase();
      let sound = 'wood';
      if (rawSound === 'digital' || rawSound === 'numérique' || rawSound === 'numerique') {
        sound = 'digital';
      } else if (rawSound === 'tambour' || rawSound === 'drum') {
        sound = 'drum';
      }
      
      metronomeSoundType = sound;
      const select = document.getElementById('metronome-sound');
      if (select) select.value = sound;
      action = `Son du métronome réglé sur ${sound === 'wood' ? 'Bois' : sound === 'digital' ? 'Digital' : 'Tambour'}`;
    } else if (metronomeVolumeMatch) {
      const vol = parseInt(metronomeVolumeMatch[1], 10);
      if (vol >= 0 && vol <= 100) {
        metronomeVolume = vol / 100;
        const slider = document.getElementById('metronome-volume-slider');
        if (slider) slider.value = vol;
        action = `Volume du métronome réglé à ${vol}%`;
      } else {
        isSuccess = false;
        action = `Volume invalide (0-100): ${vol}`;
      }
    } else if (metronomeOptWidgetMatch) {
      metronomeFlashWidget = !metronomeFlashWidget;
      const btnOpt = document.getElementById('metronome-opt-flash-widget');
      if (btnOpt) btnOpt.classList.toggle('active', metronomeFlashWidget);
      action = `Clignotement du widget : ${metronomeFlashWidget ? 'Activé' : 'Désactivé'}`;
    } else if (metronomeOptScreenMatch) {
      metronomeFlashScreen = !metronomeFlashScreen;
      const btnOpt = document.getElementById('metronome-opt-flash-screen');
      if (btnOpt) btnOpt.classList.toggle('active', metronomeFlashScreen);
      if (metronomeFlashScreen) {
        createScreenFlashOverlay();
      } else {
        removeScreenFlashOverlay();
      }
      action = `Clignotement de l'écran : ${metronomeFlashScreen ? 'Activé' : 'Désactivé'}`;
    } else if (playPlaybackVariants.some(v => cmd === v || hasWord(cmd, v))) {
      const video = getActiveVideo();
      if (video) video.play();
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
        sendYouTubeCommand('playVideo');
      }
      action = 'Playing playback/video';
    } else if (pausePlaybackVariants.some(v => cmd === v || hasWord(cmd, v))) {
      stopScrolling();
      const video = getActiveVideo();
      if (video) video.pause();
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
        sendYouTubeCommand('pauseVideo');
      }
      action = 'Pausing playback/video and scroll';
    } else if (rewindMatch) {
      const rawNum = rewindMatch[1];
      let seconds = 10;
      if (rawNum) {
        if (textToNum[rawNum.toLowerCase()] !== undefined) {
          seconds = textToNum[rawNum.toLowerCase()];
        } else if (!isNaN(parseInt(rawNum, 10))) {
          seconds = parseInt(rawNum, 10);
        }
      }
      const video = getActiveVideo();
      if (video) {
        video.currentTime = Math.max(0, video.currentTime - seconds);
        action = `Rewound video by ${seconds}s`;
      } else if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
        sendYouTubeCommand('seekTo', [0, true]);
        action = 'Rewinding drawer video to start';
      } else {
        isSuccess = false;
        action = 'No active video found to rewind';
      }
    } else if (forwardMatch) {
      const rawNum = forwardMatch[1];
      let seconds = 10;
      if (rawNum) {
        if (textToNum[rawNum.toLowerCase()] !== undefined) {
          seconds = textToNum[rawNum.toLowerCase()];
        } else if (!isNaN(parseInt(rawNum, 10))) {
          seconds = parseInt(rawNum, 10);
        }
      }
      const video = getActiveVideo();
      if (video) {
        video.currentTime = Math.min(video.duration || 9999, video.currentTime + seconds);
        action = `Forwarded video by ${seconds}s`;
      } else {
        isSuccess = false;
        action = 'No active video found to forward';
      }
    } else if (restartPlaybackVariants.some(v => cmd === v || hasWord(cmd, v))) {
      const video = getActiveVideo();
      if (video) {
        video.currentTime = 0;
        video.play();
      }
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
        sendYouTubeCommand('seekTo', [0, true]);
        sendYouTubeCommand('playVideo');
      }
      action = 'Restarting playback/video';
    } else if (saveBookmarkMatch) {
      const video = getActiveVideo();
      if (video) {
        saveBookmark(saveBookmarkMatch[1], video.currentTime);
        action = `Saving bookmark "${saveBookmarkMatch[1]}"`;
      } else {
        isSuccess = false;
        action = 'No active video to save bookmark';
      }
    } else if (loadBookmarkMatch) {
      loadBookmark(loadBookmarkMatch[1]);
      action = `Loading bookmark "${loadBookmarkMatch[1]}"`;
    } else if (repeatVariants.some(v => cmd === v || hasWord(cmd, v))) {
      if (lastAccessedBookmarkTime !== null) {
        const video = getActiveVideo();
        if (video) {
          video.currentTime = lastAccessedBookmarkTime;
          const minutes = Math.floor(lastAccessedBookmarkTime / 60);
          const seconds = Math.floor(lastAccessedBookmarkTime % 60).toString().padStart(2, '0');
          showFeedback(`🔄 Encore ! Saut vers "${lastAccessedBookmarkName || 'Repère'}" (${minutes}:${seconds})`, true);
          action = `Repeating last bookmark at ${minutes}:${seconds}`;
        } else if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
          sendYouTubeCommand('seekTo', [lastAccessedBookmarkTime, true]);
          const minutes = Math.floor(lastAccessedBookmarkTime / 60);
          const seconds = Math.floor(lastAccessedBookmarkTime % 60).toString().padStart(2, '0');
          showFeedback(`🔄 Encore ! Saut vers "${lastAccessedBookmarkName || 'Repère'}" (${minutes}:${seconds})`, true);
          action = `Repeating last drawer bookmark at ${minutes}:${seconds}`;
        } else {
          isSuccess = false;
          action = 'No active video to play again';
        }
      } else {
        isSuccess = false;
        showFeedback("❌ Aucun repère récent à répéter", false);
        action = 'No recent bookmark to repeat';
      }
    } else if (videoSpeedMatch) {
      let speedStr = videoSpeedMatch[1].replace(',', '.');
      let targetRate = 1.0;
      if (speedStr === 'normale' || speedStr === 'normal') {
        targetRate = 1.0;
      } else {
        const parsed = parseFloat(speedStr);
        if (!isNaN(parsed)) {
          targetRate = Math.max(0.25, Math.min(parsed, 4.0));
        }
      }
      const video = getActiveVideo();
      if (video) {
        video.playbackRate = targetRate;
        action = `Set video speed to ${targetRate}x`;
      } else if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
        sendYouTubeCommand('setPlaybackRate', [targetRate]);
        action = `Set drawer video speed to ${targetRate}x`;
      } else {
        isSuccess = false;
        action = 'No active video to set speed';
      }
    } else if (cmd.includes('vitesse') && (speedUpVariants.some(v => cmd.includes(v)) || cmd.includes('rapide') || cmd.includes('augmenter'))) {
      const video = getActiveVideo();
      if (video) {
        video.playbackRate = Math.min(4.0, video.playbackRate + 0.1);
        action = `Increased video speed to ${video.playbackRate.toFixed(2)}x`;
      } else {
        isSuccess = false;
        action = 'No active video to increase speed';
      }
    } else if (cmd.includes('vitesse') && (slowDownVariants.some(v => cmd.includes(v)) || cmd.includes('lent') || cmd.includes('diminuer'))) {
      const video = getActiveVideo();
      if (video) {
        video.playbackRate = Math.max(0.25, video.playbackRate - 0.1);
        action = `Decreased video speed to ${video.playbackRate.toFixed(2)}x`;
      } else {
        isSuccess = false;
        action = 'No active video to decrease speed';
      }
    } else if (scrollDownSmallVariants.some(v => cmd === v || hasWord(cmd, v))) {
      discreteScroll(200);
      action = 'Scrolling down a bit';
    } else if (scrollDownLargeVariants.some(v => cmd === v || hasWord(cmd, v))) {
      discreteScroll(500);
      action = 'Scrolling down a lot';
    } else if (scrollDownVariants.some(v => cmd === v || hasWord(cmd, v))) {
      startScrolling(1);
      action = 'Scrolling down';
    } else if (scrollUpSmallVariants.some(v => cmd === v || hasWord(cmd, v))) {
      discreteScroll(-200);
      action = 'Scrolling up a bit';
    } else if (scrollUpLargeVariants.some(v => cmd === v || hasWord(cmd, v))) {
      discreteScroll(-500);
      action = 'Scrolling up a lot';
    } else if (topVariants.some(v => cmd === v || hasWord(cmd, v))) {
      stopScrolling();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      action = 'Going to top';
    } else if (sleepVariants.some(v => cmd === v || hasWord(cmd, v))) {
      stopScrolling();
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.type === 'youtube') {
        sendYouTubeCommand('pauseVideo');
      }
      goToSleep();
      action = 'Going to sleep';
    } else if (numMatch) {
      const num = textToNum[numMatch[1].toLowerCase()];
      if (num && window.ugSearchResultLinks && window.ugSearchResultLinks[num]) {
        try {
          if (recognition) recognition.stop();
        } catch(e) {}
        window.location.href = window.ugSearchResultLinks[num];
        action = `Opening result number ${num}`;
      } else {
        isSuccess = false;
        action = `Result number ${num || numMatch[1]} not found on this page`;
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
        if (targetQuery) {
          // Detect search target site: "sur google", "on youtube", etc.
          let targetSite = null;
          const siteSuffixRegex = /\s+(?:sur|on)\s+(google|youtube|ultimate-guitar|ultimate guitar|ug)$/i;
          const siteMatch = targetQuery.match(siteSuffixRegex);
          
          if (siteMatch) {
            const siteStr = siteMatch[1].toLowerCase();
            if (siteStr === 'google') {
              targetSite = 'google.com';
            } else if (siteStr === 'youtube') {
              targetSite = 'youtube.com';
            } else if (siteStr === 'ultimate-guitar' || siteStr === 'ultimate guitar' || siteStr === 'ug') {
              targetSite = 'ultimate-guitar.com';
            }
            // Remove suffix from query
            targetQuery = targetQuery.replace(siteSuffixRegex, '').trim();
          }

          if (isPlaylist) {
            searchPlaylistUG(targetQuery);
            action = `Searching playlist for "${targetQuery}"`;
          } else {
            performSearch(targetQuery, targetSite);
            action = `Searching for "${targetQuery}" on ${targetSite || activeSiteKey}`;
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
    return isSuccess;
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

  function discreteScroll(offset) {
    let wasScrolling = false;
    let savedDirection = 0;
    if (scrollInterval) {
      wasScrolling = true;
      savedDirection = currentDirection;
      stopScrolling();
    }
    window.scrollBy({ top: offset, behavior: 'smooth' });
    if (wasScrolling) {
      setTimeout(() => {
        startScrolling(savedDirection);
      }, 500);
    }
  }

  function searchUG(query) {
    const url = `https://www.ultimate-guitar.com/search.php?title=${encodeURIComponent(query)}&page=1&type[0]=300&rating[0]=4&rating[1]=5&order=myweight`;
    window.location.href = url;
  }

  function searchPlaylistUG(query) {
    const url = `https://www.ultimate-guitar.com/user/mytabs?search=${encodeURIComponent(query)}`;
    try {
      if (recognition) recognition.stop();
    } catch(e) {}
    window.location.href = url;
  }

  function performSearch(query, siteKey) {
    let site = siteKey;
    if (!site) {
      site = activeSiteKey !== 'default' ? activeSiteKey : 'ultimate-guitar.com';
    }
    const config = SITE_CONFIGS[site] || SITE_CONFIGS['default'];
    const url = config.searchUrl(query);
    try {
      if (recognition) recognition.stop();
    } catch(e) {}
    window.location.href = url;
  }

  function cleanUrlPath(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      return url.pathname.replace(/\/$/, '');
    } catch (e) {
      return urlStr;
    }
  }

  function highlightBestResults() {
    console.log("[Rockstar] Starting highlightBestResults...");
    if (!window.location.href.includes('search.php') && !window.location.href.includes('search') && !window.location.href.includes('explore')) {
      console.log("[Rockstar] Not a search, explore or search.php page.");
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

          const links = Array.from(document.querySelectorAll('a')).filter(a => cleanUrlPath(a.href) === cleanUrlPath(bestUrl));
          
          if (links.length > 0) {
            console.log("[Rockstar] Found links in DOM:", links.length);
            clearInterval(domInterval);
            
            links.forEach(link => {
              if (link.parentElement) {
                link.parentElement.classList.add('ug-voice-highlighted-row');
              }
            });
            
            const customRow = document.createElement('div');
            customRow.id = 'ug-voice-custom-best-row';
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
    if (!activeConfig.isSearchPage()) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attempts > 20) {
        clearInterval(interval);
        return;
      }

      const tabLinks = activeConfig.getLinks();

      if (tabLinks.length === 0) return;

      clearInterval(interval);
      console.log("[Rockstar] Found links for numbering:", tabLinks.length);

      // Remove existing badges to avoid duplicates on re-render
      document.querySelectorAll('.ug-result-badge').forEach(el => el.remove());

      window.ugSearchResultLinks = {};
      let counter = 1;
      const processedUrls = new Set();

      tabLinks.forEach(link => {
        const url = link.href.split('?')[0];
        if (!processedUrls.has(url)) {
          processedUrls.add(url);
          window.ugSearchResultLinks[counter] = link.href;

          const badge = document.createElement('span');
          badge.className = 'ug-result-badge';
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
    const bar = getOrCreateFloatingBar();
    bar.classList.add('banner-active');
    
    document.getElementById('banner-btn-accept').addEventListener('click', () => {
      chrome.storage.sync.get('allowedDomains', (res) => {
        const allowedDomains = res.allowedDomains || {};
        allowedDomains[currentDomain] = true;
        chrome.storage.sync.set({ allowedDomains }, () => {
          removeActivationBanner();
          initializeDrawer();
          if (SpeechRecognition) {
            initializeRockstar();
          }
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
    const bar = getOrCreateFloatingBar();
    bar.classList.remove('banner-active');
  }

  function extractUGMetadata() {
    let title = '';
    let artist = '';
    let capo = 0;
    
    // 1. Try og:title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      const content = ogTitle.content;
      const parts = content.split(' Chords by ');
      if (parts.length === 2) {
        title = parts[0].trim();
        artist = parts[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
      } else {
        const parts2 = content.split(' Tab by ');
        if (parts2.length === 2) {
          title = parts2[0].trim();
          artist = parts2[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
        }
      }
    }
    
    // 2. DOM Fallbacks
    if (!title) {
      const h1 = document.querySelector('h1');
      if (h1) title = h1.innerText.trim();
    }
    
    // 3. Extract capo
    const allText = document.body.innerText;
    const capoMatch = allText.match(/capo:\s*(\d+)/i) || allText.match(/capodastre:\s*(\d+)/i) || allText.match(/capo\s+(\d+)\w*\s+fret/i);
    if (capoMatch) {
      capo = parseInt(capoMatch[1], 10);
    }
    
    return {
      title: title || document.title.replace(/ Chords.*/, '').replace(/ Tab.*/, '').trim(),
      artist: artist || "Artiste inconnu",
      capo: capo
    };
  }

  function createDrawerUI() {
    if (document.getElementById('rockstar-drawer') || document.getElementById('ug-drawer-btn')) return;

    // 1. Create Floating Button
    drawerBtn = document.createElement('button');
    drawerBtn.id = 'ug-drawer-btn';
    drawerBtn.innerHTML = '🎸';
    drawerBtn.title = 'Ouvrir Rockstar Companion (Notes & Playbacks)';
    appendButtonsToFloatingBar();
    if (document.getElementById('ug-voice-activation-banner')) {
      const bar = getOrCreateFloatingBar();
      bar.classList.add('banner-active');
    }

    // 2. Create Drawer Container
    drawerContainer = document.createElement('div');
    drawerContainer.id = 'rockstar-drawer';
    drawerContainer.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-header-title">
          <h3 id="drawer-title">Chargement...</h3>
          <input type="text" id="drawer-artist" class="drawer-artist-input" placeholder="Artiste" value="-">
        </div>
        <div class="drawer-header-actions">
          <button id="drawer-magic-btn" title="Extraire automatiquement les clés et transpositions depuis la page">🪄</button>
          <button id="drawer-close-btn">&times;</button>
        </div>
      </div>

      <div class="drawer-body">
        <div class="drawer-section">
          <div class="drawer-grid">
            <div class="drawer-input-group">
              <label>Clé / Tonalité</label>
              <input type="text" id="drawer-key" placeholder="Ex: Gm">
            </div>
            <div class="drawer-input-group">
              <label>Capo</label>
              <input type="number" id="drawer-capo" min="0" max="24" value="0">
            </div>
            <div class="drawer-input-group">
              <label>Trans</label>
              <input type="number" id="drawer-transpose" min="-12" max="12" value="0">
            </div>
          </div>
        </div>

        <div class="drawer-section">
          <div class="drawer-label-row">
            <label>Notes d'interprétation</label>
            <button class="drawer-dictate-btn" data-target="drawer-notes" title="Dicter les notes">🎤</button>
          </div>
          <textarea id="drawer-notes" placeholder="Notes de structure, ressentis..."></textarea>
        </div>

        <div class="drawer-section">
          <div class="drawer-label-row">
            <label>Astuces de jeu</label>
            <button class="drawer-dictate-btn" data-target="drawer-tips" title="Dicter les astuces">🎤</button>
          </div>
          <textarea id="drawer-tips" placeholder="Rythmique, strumming..."></textarea>
        </div>

        <div class="drawer-section flex-col">
          <div class="drawer-section-header">
            <label>Liens de Playback</label>
            <button id="drawer-add-link-btn">+ Ajouter</button>
          </div>

          <div id="drawer-link-form" class="drawer-link-form" style="display: none;">
            <div class="drawer-form-group">
              <label>Nom du lien :</label>
              <input type="text" id="drawer-new-link-title" placeholder="Nom du lien">
            </div>
            <div class="drawer-form-group">
              <label>URL (YouTube / Spotify) :</label>
              <input type="text" id="drawer-new-link-url" placeholder="URL YouTube ou Spotify">
            </div>
            <div class="drawer-form-group">
              <label>Type :</label>
              <select id="drawer-new-link-type">
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div class="drawer-form-buttons">
              <button id="drawer-save-link-btn" class="drawer-btn-ok">Enregistrer</button>
              <button id="drawer-cancel-link-btn" class="drawer-btn-cancel">Annuler</button>
            </div>
          </div>

          <ul id="drawer-links-list"></ul>
          
          <div id="drawer-media-container" class="drawer-media-container">
            <div class="drawer-media-empty">Aucun playback en lecture</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(drawerContainer);

    // 3. Events
    drawerBtn.addEventListener('click', toggleDrawer);
    drawerContainer.querySelector('#drawer-close-btn').addEventListener('click', closeDrawer);

    // Fields events
    const artistInput = drawerContainer.querySelector('#drawer-artist');
    const keyInput = drawerContainer.querySelector('#drawer-key');
    const capoInput = drawerContainer.querySelector('#drawer-capo');
    const transInput = drawerContainer.querySelector('#drawer-transpose');
    const notesText = drawerContainer.querySelector('#drawer-notes');
    const tipsText = drawerContainer.querySelector('#drawer-tips');

    function saveDrawerData() {
      if (!currentSong) return;
      if (artistInput) {
        currentSong.artist = artistInput.value.trim() || "Artiste inconnu";
      }
      currentSong.key = keyInput.value.trim();
      currentSong.capo = parseInt(capoInput.value, 10) || 0;
      currentSong.transpose = parseInt(transInput.value, 10) || 0;
      currentSong.notes = notesText.value;
      currentSong.interpretationNotes = notesText.value;
      currentSong.playingTips = tipsText.value;

      if (window.storageService) {
        window.storageService.saveSong(currentSong);
      }
    }

    if (artistInput) {
      artistInput.addEventListener('blur', saveDrawerData);
    }
    keyInput.addEventListener('blur', saveDrawerData);
    capoInput.addEventListener('change', saveDrawerData);
    transInput.addEventListener('change', saveDrawerData);

    let debounceSave = null;
    function debouncedSave() {
      clearTimeout(debounceSave);
      debounceSave = setTimeout(saveDrawerData, 1000);
    }
    notesText.addEventListener('input', debouncedSave);
    tipsText.addEventListener('input', debouncedSave);

    // Magic Wand Event
    const magicBtn = drawerContainer.querySelector('#drawer-magic-btn');
    if (magicBtn) {
      magicBtn.addEventListener('click', () => {
        const extracted = autoExtractMetadata();
        let updated = false;

        if (extracted.artist) {
          artistInput.value = extracted.artist;
          currentSong.artist = extracted.artist;
          updated = true;
        }
        if (extracted.key) {
          keyInput.value = extracted.key;
          currentSong.key = extracted.key;
          updated = true;
        }
        if (extracted.capo !== undefined && extracted.capo > 0) {
          capoInput.value = extracted.capo;
          currentSong.capo = extracted.capo;
          updated = true;
        }
        if (extracted.transpose !== undefined && extracted.transpose !== 0) {
          transInput.value = extracted.transpose;
          currentSong.transpose = extracted.transpose;
          updated = true;
        }

        if (updated) {
          [artistInput, keyInput, capoInput, transInput].forEach(input => {
            if (!input) return;
            input.style.transition = 'background-color 0.3s';
            input.style.backgroundColor = 'rgba(255, 193, 7, 0.2)';
            setTimeout(() => {
              input.style.backgroundColor = 'transparent';
            }, 800);
          });
          saveDrawerData();
          showFeedback("Mises à jour appliquées par la baguette magique !", true);
        } else {
          showFeedback("Aucune clé/capo/transposition/artiste trouvée à extraire.", false);
        }
      });
    }

    // Dictation Events
    const dictationButtons = drawerContainer.querySelectorAll('.drawer-dictate-btn');
    const DictationSpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!DictationSpeechClass) {
      dictationButtons.forEach(btn => btn.style.display = 'none');
    } else {
      dictationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          toggleDictation(targetId, btn);
        });
      });
    }

    // Playback Link Events
    const addLinkBtn = drawerContainer.querySelector('#drawer-add-link-btn');
    const linkForm = drawerContainer.querySelector('#drawer-link-form');
    const linkTitle = drawerContainer.querySelector('#drawer-new-link-title');
    const linkUrl = drawerContainer.querySelector('#drawer-new-link-url');
    const linkType = drawerContainer.querySelector('#drawer-new-link-type');
    const saveLinkBtn = drawerContainer.querySelector('#drawer-save-link-btn');
    const cancelLinkBtn = drawerContainer.querySelector('#drawer-cancel-link-btn');

    addLinkBtn.addEventListener('click', () => {
      linkForm.style.display = linkForm.style.display === 'none' ? 'block' : 'none';
      linkTitle.value = '';
      linkUrl.value = '';
      linkType.value = 'youtube';
    });

    linkUrl.addEventListener('input', () => {
      const val = linkUrl.value.toLowerCase().trim();
      if (val.includes('youtube.com') || val.includes('youtu.be')) {
        linkType.value = 'youtube';
      } else if (val.includes('spotify.com') || val.startsWith('spotify:')) {
        linkType.value = 'spotify';
      } else {
        linkType.value = 'other';
      }
    });

    cancelLinkBtn.addEventListener('click', () => {
      linkForm.style.display = 'none';
    });

    saveLinkBtn.addEventListener('click', () => {
      const url = linkUrl.value.trim();
      const title = linkTitle.value.trim();
      const type = linkType.value;

      if (!url) return;
      if (!currentSong.links) currentSong.links = [];

      currentSong.links.push({
        title: title || (type === 'youtube' ? 'Vidéo YouTube' : 'Audio Spotify'),
        url: url,
        type: type
      });

      if (window.storageService) {
        window.storageService.saveSong(currentSong).then(() => {
          linkForm.style.display = 'none';
          renderDrawerLinks();
        });
      }
    });
  }

  function toggleDrawer() {
    if (drawerContainer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    drawerContainer.classList.add('open');
    loadSongForDrawer();
  }

  function closeDrawer() {
    drawerContainer.classList.remove('open');
    activeDrawerPlaybackLink = null;
    const mediaContainer = drawerContainer.querySelector('#drawer-media-container');
    if (mediaContainer) {
      mediaContainer.innerHTML = '<div class="drawer-media-empty">Aucun playback en lecture</div>';
    }
  }

  function loadSongForDrawer() {
    const url = window.location.href;
    if (!window.storageService) return;

    window.storageService.getSong(url).then(song => {
      if (song) {
        currentSong = song;
        populateDrawerFields();
      } else {
        const metadata = extractUGMetadata();
        currentSong = {
          url: url,
          title: metadata.title,
          artist: metadata.artist,
          key: "",
          capo: metadata.capo,
          transpose: 0,
          notes: "",
          interpretationNotes: "",
          playingTips: "",
          links: []
        };
        window.storageService.saveSong(currentSong).then(() => {
          populateDrawerFields();
        });
      }
    });
  }

  function populateDrawerFields() {
    drawerContainer.querySelector('#drawer-title').innerText = currentSong.title;
    drawerContainer.querySelector('#drawer-artist').value = currentSong.artist;
    drawerContainer.querySelector('#drawer-key').value = currentSong.key || '';
    drawerContainer.querySelector('#drawer-capo').value = currentSong.capo || 0;
    drawerContainer.querySelector('#drawer-transpose').value = currentSong.transpose || 0;
    drawerContainer.querySelector('#drawer-notes').value = currentSong.notes || currentSong.interpretationNotes || '';
    drawerContainer.querySelector('#drawer-tips').value = currentSong.playingTips || '';
    
    renderDrawerLinks();
  }

  function renderDrawerLinks() {
    const list = drawerContainer.querySelector('#drawer-links-list');
    list.innerHTML = '';
    
    const links = currentSong.links || [];
    
    // Automatically select the first link if none is active and links exist
    if (!activeDrawerPlaybackLink && links.length > 0) {
      activeDrawerPlaybackLink = links[0];
    }

    if (links.length === 0) {
      list.innerHTML = '<li style="padding: 6px; font-size:11px; color:#888; text-align:center;">Aucun lien</li>';
      playDrawerPlayback();
      return;
    }

    links.forEach((link, idx) => {
      const li = document.createElement('li');
      li.className = 'drawer-link-item';
      if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.url === link.url) {
        li.classList.add('active');
      }

      let icon = '🔗';
      if (link.type === 'youtube') icon = '📺';
      if (link.type === 'spotify') icon = '🎵';

      li.innerHTML = `
        <span class="drawer-link-info">
          <span>${icon}</span>
          <span class="drawer-link-title">${link.title}</span>
        </span>
        <button class="drawer-link-delete" data-index="${idx}">&times;</button>
      `;

      li.querySelector('.drawer-link-info').addEventListener('click', () => {
        activeDrawerPlaybackLink = link;
        renderDrawerLinks();
      });

      li.querySelector('.drawer-link-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        currentSong.links.splice(idx, 1);
        window.storageService.saveSong(currentSong).then(() => {
          if (activeDrawerPlaybackLink && activeDrawerPlaybackLink.url === link.url) {
            activeDrawerPlaybackLink = null;
          }
          renderDrawerLinks();
        });
      });

      list.appendChild(li);
    });

    // Always update playback preview based on the active link
    playDrawerPlayback();
  }

  function playDrawerPlayback() {
    const container = drawerContainer.querySelector('#drawer-media-container');
    container.innerHTML = '';

    if (!activeDrawerPlaybackLink) {
      container.innerHTML = '<div class="drawer-media-empty">Aucun playback en lecture</div>';
      return;
    }

    const { url, type } = activeDrawerPlaybackLink;
    if (type === 'youtube') {
      let videoId = '';
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
          videoId = urlObj.searchParams.get('v');
        } else if (urlObj.hostname.includes('youtu.be')) {
          videoId = urlObj.pathname.slice(1);
        }
      } catch(e) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
          videoId = match[2];
        }
      }

      if (videoId) {
        container.innerHTML = `
          <iframe 
            id="drawer-youtube-iframe"
            src="https://www.youtube.com/embed/${videoId}?enablejsapi=1" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
          </iframe>`;
      } else {
        container.innerHTML = '<div class="drawer-media-empty">Lien YouTube invalide</div>';
      }
    } else if (type === 'spotify') {
      let embedUrl = '';
      if (url.startsWith('spotify:')) {
        const parts = url.split(':');
        if (parts.length >= 3) {
          const t = parts[1];
          const id = parts[2];
          const validTypes = ['track', 'playlist', 'album', 'artist', 'show', 'episode'];
          if (validTypes.includes(t) && id) {
            embedUrl = `https://open.spotify.com/embed/${t}/${id}`;
          }
        }
      } else {
        try {
          const urlObj = new URL(url);
          if (urlObj.hostname.includes('spotify.com')) {
            const paths = urlObj.pathname.split('/').filter(Boolean);
            const validTypes = ['track', 'playlist', 'album', 'artist', 'show', 'episode'];
            const typeIndex = paths.findIndex(segment => validTypes.includes(segment));
            if (typeIndex !== -1 && typeIndex + 1 < paths.length) {
              const t = paths[typeIndex];
              const id = paths[typeIndex + 1];
              embedUrl = `https://open.spotify.com/embed/${t}/${id}`;
            }
          }
        } catch(e) {}
      }

      if (embedUrl) {
        container.innerHTML = `
          <iframe 
            id="drawer-spotify-iframe"
            src="${embedUrl}" 
            allow="encrypted-media"
            style="width: 100%; height: 80px; border: none; border-radius: 8px;">
          </iframe>`;
      } else {
        container.innerHTML = '<div class="drawer-media-empty">Lien Spotify invalide</div>';
      }
    } else {
      container.innerHTML = `
        <div class="drawer-media-empty">
          <a href="${url}" target="_blank" style="color:#d880ff; text-decoration:underline;">Ouvrir le lien externe</a>
        </div>`;
    }
  }

  function autoExtractMetadata() {
    let key = "";
    let transpose = 0;
    let capo = 0;
    let artist = "";

    // 1. Essayer le JSON js-store
    try {
      const storeDiv = document.querySelector('.js-store');
      if (storeDiv) {
        const raw = storeDiv.getAttribute('data-content');
        if (raw) {
          const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
          const data = JSON.parse(decoded);
          const tab = data?.store?.page?.data?.tab;
          if (tab) {
            if (tab.meta && tab.meta.tonality) {
              key = tab.meta.tonality;
            }
            if (tab.meta && tab.meta.capo) {
              capo = tab.meta.capo;
            }
            if (tab.artist_name) {
              artist = tab.artist_name.trim();
            }
          }
        }
      }
    } catch (e) {
      console.warn("Erreur extraction js-store:", e);
    }

    // 2. Si non trouvé par js-store, scanner les éléments textuels pour la clé
    if (!key) {
      const elements = Array.from(document.querySelectorAll('span, div, td'));
      for (const el of elements) {
        const text = el.innerText.trim();
        if (/^(key|tonalité|tonality)\s*:\s*([A-G][#b]?m?)/i.test(text)) {
          const match = text.match(/^(key|tonalité|tonality)\s*:\s*([A-G][#b]?m?)/i);
          key = match[2];
          break;
        }
      }
    }

    // 3. Scanner textuellement le capo et la transposition
    const allText = document.body.innerText;

    if (!capo) {
      const capoMatch = allText.match(/capo\s*(?::|at|case|fret)?\s*(\d+)/i) || 
                        allText.match(/capodastre\s*(?::|à|a|case)?\s*(\d+)/i) || 
                        allText.match(/(\d+)(?:nd|rd|th)?\s*fret\s*capo/i);
      if (capoMatch) {
        capo = parseInt(capoMatch[1], 10);
      }
    }

    // Extraction transposition
    const transposeMatch = allText.match(/transpose\s*(?::|by|at)?\s*([+-]?\d+)/i) || 
                           allText.match(/transposition\s*(?::|de)?\s*([+-]?\d+)/i);
    if (transposeMatch) {
      transpose = parseInt(transposeMatch[1], 10);
    } else {
      const transButtons = Array.from(document.querySelectorAll('button, span, div'));
      for (const btn of transButtons) {
        const text = btn.innerText.trim();
        if (/...transpose\s*([+-]\d+)/i.test(text)) {
          const match = text.match(/...transpose\s*([+-]\d+)/i);
          transpose = parseInt(match[1], 10);
          break;
        }
        if (btn.classList.contains('transpose-value') || text.includes('transpose')) {
          const val = parseInt(text.replace(/[^0-9+-]/g, ''), 10);
          if (!isNaN(val)) {
            transpose = val;
            break;
          }
        }
      }
    }

    // 4. Scanner textuellement l'artiste
    if (!artist) {
      // og:title fallback
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        const content = ogTitle.content;
        const parts = content.split(' Chords by ');
        if (parts.length === 2) {
          artist = parts[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
        } else {
          const parts2 = content.split(' Tab by ');
          if (parts2.length === 2) {
            artist = parts2[1].replace(/ tabs$/, '').replace(/ chords$/, '').trim();
          }
        }
      }

      if (!artist) {
        const artistMatch = allText.match(/artiste?\s*:\s*([^\n\r]+)/i) || 
                            allText.match(/artist\s*:\s*([^\n\r]+)/i) ||
                            allText.match(/by\s+([A-Za-z0-9\s\.\&\-\'\’]+)\s+chords/i);
        if (artistMatch) {
          artist = artistMatch[1].trim();
        }
      }
    }

    return { key, capo, transpose, artist };
  }

  function toggleDictation(targetId, button) {
    const textarea = drawerContainer.querySelector(`#${targetId}`);
    if (!textarea) return;

    if (activeDictationTarget === targetId) {
      stopDictation();
      return;
    }

    if (activeDictationTarget) {
      stopDictation();
    }

    activeDictationTarget = targetId;
    activeDictationBtn = button;
    button.classList.add('recording');
    button.title = "En écoute... Cliquez pour arrêter";

    // Mettre en pause la reconnaissance Rockstar
    let wasMainListening = isListening;
    if (isListening) {
      // Temporairement, on n'appelle pas stopListening() en entier (qui cache le tuner/chord), juste recognition.stop()
      try {
        recognition.stop();
      } catch(e) {}
      // Bloquer le redémarrage automatique temporairement
      isListening = false; 
    }

    const DictationClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!DictationClass) {
      alert("La dictée vocale n'est pas supportée.");
      stopDictation();
      return;
    }

    dictationRecognition = new DictationClass();
    dictationRecognition.continuous = false;
    dictationRecognition.interimResults = false;
    dictationRecognition.lang = 'fr-FR'; // Langue de dictée par défaut

    dictationRecognition.onresult = (event) => {
      const resultText = event.results[0][0].transcript;
      if (resultText) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + (start > 0 && val[start-1] !== ' ' ? ' ' : '') + resultText + (end < val.length && val[end] !== ' ' ? ' ' : '') + val.substring(end);
        textarea.dispatchEvent(new Event('input')); // Déclencher la sauvegarde
      }
    };

    dictationRecognition.onend = () => {
      stopDictation();
      if (wasMainListening) {
        isListening = true;
        try {
          recognition.start();
        } catch(e) {}
      }
    };

    dictationRecognition.onerror = (e) => {
      console.error("Erreur dictée:", e);
      stopDictation();
      if (wasMainListening) {
        isListening = true;
        try {
          recognition.start();
        } catch(e) {}
      }
    };

    dictationRecognition.start();
  }

  function stopDictation() {
    if (dictationRecognition) {
      try {
        dictationRecognition.stop();
      } catch(e) {}
      dictationRecognition = null;
    }
    if (activeDictationBtn) {
      activeDictationBtn.classList.remove('recording');
      activeDictationBtn.title = "Dicter";
    }
    activeDictationTarget = null;
    activeDictationBtn = null;
  }

  function initializeDrawer() {
    if (isDrawerInitialized) return;
    isDrawerInitialized = true;
    createDrawerUI();
    loadSongForDrawer();
  }

  // Storage preference listeners and bootstrap check
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord', 'allowedDomains', 'muteAllSites'], (result) => {
      const allowedDomains = result.allowedDomains || {};
      const muteAllSites = result.muteAllSites || false;
      const status = allowedDomains[currentDomain];

      // Toujours initialiser le Drawer si sur le site par défaut, si le site est autorisé, ou si la bannière d'activation est affichée (status === undefined)
      if (isUG || status === true || status === undefined) {
        initializeDrawer();
      }

      // Initialiser Rockstar (Reconnaissance Vocale & Accordeur) si supporté
      if (SpeechRecognition) {
        buildChordTemplates(result.chord7th || false, result.chordSus || false);
        if (result.wakeWord !== undefined) {
          wakeWord = result.wakeWord.trim() || 'Rockstar';
          wakeWordLower = wakeWord.toLowerCase();
        }
        
        if (isUG) {
          initializeRockstar();
        } else {
          if (status === true) {
            initializeRockstar();
          } else if (status === false || muteAllSites === true) {
            // Bloqué ou Mute
          } else {
            showActivationBanner();
          }
        }
      } else {
        // Fallback sans reconnaissance vocale
        if (!isUG && status === undefined && !muteAllSites) {
          showActivationBanner();
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        chrome.storage.sync.get(['chord7th', 'chordSus', 'wakeWord', 'allowedDomains', 'muteAllSites'], (result) => {
          const allowedDomains = result.allowedDomains || {};
          const muteAllSites = result.muteAllSites || false;
          const status = allowedDomains[currentDomain];

          if (isUG || status === true || status === undefined) {
            initializeDrawer();
          }

          if (SpeechRecognition) {
            buildChordTemplates(result.chord7th || false, result.chordSus || false);
            const oldWakeWord = wakeWord;
            wakeWord = (result.wakeWord !== undefined ? result.wakeWord.trim() : 'Rockstar') || 'Rockstar';
            wakeWordLower = wakeWord.toLowerCase();
            
            if (isInitialized && oldWakeWord !== wakeWord) {
              updateUIForWakeWord();
            }

            if (!isUG) {
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
          }
        });
      }
    });
  } else {
    buildChordTemplates(false, false);
    if (isUG) {
      initializeDrawer();
      if (SpeechRecognition) {
        initializeRockstar();
      }
    }
  }
}
