// widgets/singingTracker.js
(function() {
  if (!window.RockstarCore) return;

  let singingContainer = null;
  let singingCanvas = null;
  let singingNoteBg = null;
  let singingInfoOverlay = null;
  let maxBtn = null;

  let singingActive = false;
  let isMaximized = false;
  
  // History of pitch points: { time: number, midi: number, freq: number } or null (silence)
  const pitchHistory = [];
  const MAX_HISTORY_POINTS = 300;
  
  // Audio analysis variables
  const sampleBuf = new Float32Array(2048);
  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  
  // Smoothing and Viewport Interpolation
  let smoothCenterMidi = 60; // Start at Middle C (C4)
  let lastActivePitchTime = 0;
  let currentNoteName = "-";
  let currentFreq = 0;

  function initSingingTracker() {
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
          console.error("[RockstarSinging] Failed to resume AudioContext", err);
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
        });
      }
      if (singingContainer) singingContainer.classList.add('visible');
      singingActive = true;
      startRenderLoop();
      return;
    }

    // Initialize sharing analyser if it wasn't initialized yet
    const newAnalyser = audioContext.createAnalyser();
    newAnalyser.fftSize = 16384;
    window.RockstarCore.setAnalyser(newAnalyser);

    window.addEventListener('click', unlockAudioContext);
    window.addEventListener('keydown', unlockAudioContext);
    window.addEventListener('touchstart', unlockAudioContext);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(newAnalyser);
      singingActive = true;
      if (singingContainer) singingContainer.classList.add('visible');
      startRenderLoop();
    }).catch(err => {
      console.error("[RockstarSinging] Microphone access denied", err);
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
    // Vocals require a clean signal. If rms is too low, treat as silence.
    if (rms < 0.015) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
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

  function toggleMaximize(e) {
    if (e) e.stopPropagation();
    return; // Temporarily disabled
    isMaximized = !isMaximized;
    
    if (isMaximized) {
      singingContainer.classList.add('maximized');
      maxBtn.innerHTML = `&#10513;`; // Minimize icon
      maxBtn.title = "Réduire le graphique";
      // Adjust canvas resolution for fullscreen
      resizeCanvas();
    } else {
      singingContainer.classList.remove('maximized');
      maxBtn.innerHTML = `&#10514;`; // Maximize icon
      maxBtn.title = "Agrandir le graphique";
      resizeCanvas();
    }
  }

  function resizeCanvas() {
    if (!singingCanvas) return;
    const rect = singingCanvas.parentElement.getBoundingClientRect();
    // Setting width & height attributes directly sets canvas buffer size
    singingCanvas.width = rect.width;
    singingCanvas.height = rect.height;
  }

  function startRenderLoop() {
    // Prevent multiple loops
    if (window.singingLoopId) {
      cancelAnimationFrame(window.singingLoopId);
    }
    
    // Resize initially
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function tick() {
      if (!singingActive) return;
      window.singingLoopId = requestAnimationFrame(tick);
      
      const analyser = window.RockstarCore.getAnalyser();
      const audioContext = window.RockstarCore.getAudioContext();
      
      if (!analyser || !singingCanvas) return;
      
      // Fetch time domain data
      analyser.getFloatTimeDomainData(sampleBuf);
      const pitch = autoCorrelate(sampleBuf, audioContext.sampleRate);
      
      const now = Date.now();
      let activePoint = null;

      // Restrict detected voice pitch to human singing boundaries: C2 (~65Hz) to C7 (2200Hz)
      if (pitch !== -1 && pitch >= 60 && pitch <= 2200) {
        currentFreq = Math.round(pitch * 10) / 10;
        const noteNum = 12 * Math.log2(pitch / 440) + 69;
        const roundedMidi = Math.round(noteNum);
        
        const noteName = noteStrings[roundedMidi % 12];
        const octave = Math.floor(roundedMidi / 12) - 1;
        currentNoteName = `${noteName}${octave}`;
        
        activePoint = {
          time: now,
          midi: noteNum,
          freq: currentFreq,
          noteName: currentNoteName
        };

        lastActivePitchTime = now;
      } else {
        // Fade out pitch tracker note display if quiet for more than 1.5s
        if (now - lastActivePitchTime > 1500) {
          currentNoteName = "-";
          currentFreq = 0;
        }
      }

      // Add to history list
      pitchHistory.push(activePoint);
      if (pitchHistory.length > MAX_HISTORY_POINTS) {
        pitchHistory.shift();
      }

      // Draw everything
      drawGraph();
    }
    
    window.singingLoopId = requestAnimationFrame(tick);
  }

  function drawGraph() {
    const ctx = singingCanvas.getContext('2d');
    const width = singingCanvas.width;
    const height = singingCanvas.height;
    
    ctx.clearRect(0, 0, width, height);

    // Update note bg element
    if (singingNoteBg) {
      singingNoteBg.innerText = currentNoteName;
      // Change color based on voice status
      if (currentNoteName !== "-") {
        singingNoteBg.style.color = '#ff6c00';
        singingNoteBg.style.opacity = isMaximized ? '0.12' : '0.25';
      } else {
        singingNoteBg.style.color = '#888';
        singingNoteBg.style.opacity = isMaximized ? '0.04' : '0.1';
      }
    }

    if (singingInfoOverlay) {
      if (currentNoteName !== "-") {
        singingInfoOverlay.innerText = `${currentFreq} Hz`;
      } else {
        singingInfoOverlay.innerText = "";
      }
    }

    const now = Date.now();
    const timeSpan = isMaximized ? 8000 : 4000; // Duration visible on X-axis (ms)
    
    // Determine Y scale boundaries
    let minMidi = 45; // Default: A2
    let maxMidi = 84; // Default: C6
    
    if (isMaximized) {
      // Set padded viewport ranges to prevent clipping at top and bottom (expanded to C2-C7 range)
      minMidi = 33; // A1 (safety pad below C2/36)
      maxMidi = 99; // D#7 (safety pad above C7/96)

      // Only display labels for these key guide notes to prevent vertical crowding
      const guideNotes = ["C2", "G2", "C3", "G3", "C4", "G4", "C5", "G5", "C6", "G6", "C7"];

      // Draw Grid Lines with note names and frequencies
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      const startMidi = 36; // Start grid at C2
      const endMidi = 96;   // End grid at C7

      for (let m = startMidi; m <= endMidi; m++) {
        const y = height - ((m - minMidi) / (maxMidi - minMidi)) * height;
        const noteName = noteStrings[m % 12];
        const octave = Math.floor(m / 12) - 1;
        const noteFullLabel = `${noteName}${octave}`;
        const hz = Math.round(440 * Math.pow(2, (m - 69) / 12) * 10) / 10;
        
        const isSharp = noteName.includes('#');
        const isCurrentMidi = currentNoteName !== "-" && Math.round(m) === Math.round(12 * Math.log2(currentFreq / 440) + 69);
        
        if (isCurrentMidi) {
          ctx.strokeStyle = 'rgba(255, 108, 0, 0.4)';
          ctx.lineWidth = 2;
          ctx.fillStyle = '#ff9f1c';
          ctx.font = 'bold 12px "Outfit", sans-serif';
        } else if (isSharp) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 0.5;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.font = '10px "Outfit", sans-serif';
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.font = '11px "Outfit", sans-serif';
        }

        // Draw line
        ctx.beginPath();
        ctx.moveTo(100, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        // Draw note text label on left sidebar gutter (guide notes or current active note only)
        if (guideNotes.includes(noteFullLabel) || isCurrentMidi) {
          ctx.fillText(`${noteFullLabel} (${hz}Hz)`, 15, y);
        }
      }
      ctx.restore();
    } else {
      // Small view scaling: scale dynamically based on the max and min of active points in history
      const activeMidis = pitchHistory.filter(p => p !== null).map(p => p.midi);
      if (activeMidis.length > 0) {
        const histMin = Math.min(...activeMidis);
        const histMax = Math.max(...activeMidis);
        const center = (histMin + histMax) / 2;
        const span = Math.max(12, (histMax - histMin) * 1.5); // Minimum 1 octave
        minMidi = center - span/2;
        maxMidi = center + span/2;
      } else {
        minMidi = 55; // Default C3
        maxMidi = 79; // Default G5
      }
    }

    // Helper: Map data point to canvas screen space
    function getXY(point) {
      if (!point) return null;
      const x = ((point.time - (now - timeSpan)) / timeSpan) * (width - (isMaximized ? 110 : 0)) + (isMaximized ? 110 : 0);
      const y = height - ((point.midi - minMidi) / (maxMidi - minMidi)) * height;
      return { x, y };
    }

    // Plot pitch timeline line
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = isMaximized ? 4 : 2;
    ctx.strokeStyle = '#ff6c00';
    
    // Draw shadow/glow on maximized graph
    if (isMaximized) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff6c00';
    }

    let drawingLine = false;
    
    for (let i = 0; i < pitchHistory.length; i++) {
      const p = pitchHistory[i];
      const coords = getXY(p);
      
      // Skip drawing points that would be off the left edge of the timeline
      if (coords && coords.x < (isMaximized ? 100 : 0)) {
        continue;
      }
      
      if (coords) {
        if (!drawingLine) {
          ctx.beginPath();
          ctx.moveTo(coords.x, coords.y);
          drawingLine = true;
        } else {
          ctx.lineTo(coords.x, coords.y);
        }
      } else {
        if (drawingLine) {
          ctx.stroke();
          drawingLine = false;
        }
      }
    }
    
    if (drawingLine) {
      ctx.stroke();
    }
    ctx.restore();
  }

  // Register commands on RockstarCore
  window.RockstarCore.registerCommand({
    name: 'Singing Pitch Tracker',
    variants: ['chant', 'vocal pitch', 'pitch tracker'],
    handler: () => {
      initSingingTracker();
      return { success: true, action: 'Activation du tracker de chant' };
    }
  });

  window.RockstarCore.registerHelpCommand({ label: "🎤 Vocal Pitch Tracker", cmd: "chant", env: "tab" });

  // Handle listening state changes to clean up or auto-init
  window.RockstarCore.onListeningChanged((isListening) => {
    // Keep singing tracker active even when voice control is off
  });

  // Init Singing tracker UI
  window.RockstarCore.registerInit(() => {
    singingContainer = document.createElement('div');
    singingContainer.id = 'ug-singing-tracker';
    
    singingContainer.innerHTML = `
      <div class="singing-max-content">
        <div class="singing-header">
          <div class="singing-label">Vocal Pitch</div>
          <button class="singing-max-btn" title="Agrandir le graphique">&#10514;</button>
        </div>
        <div class="singing-canvas-container">
          <div class="singing-note-bg">-</div>
          <canvas class="singing-canvas"></canvas>
          <div class="singing-info-overlay"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(singingContainer);
    
    singingCanvas = singingContainer.querySelector('.singing-canvas');
    singingNoteBg = singingContainer.querySelector('.singing-note-bg');
    singingInfoOverlay = singingContainer.querySelector('.singing-info-overlay');
    maxBtn = singingContainer.querySelector('.singing-max-btn');
    if (maxBtn) {
      maxBtn.style.display = 'none';
      maxBtn.addEventListener('click', toggleMaximize);
    }

    // Close maximized state with Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMaximized) {
        toggleMaximize();
      }
    });

    // Sync state
    initSingingTracker();
  });

})();
