document.addEventListener('DOMContentLoaded', () => {
  // --- Language Toggle System ---
  const langToggle = document.getElementById('lang-toggle');
  let currentLang = 'fr'; // default is French

  function setLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    
    // Toggle page title
    if (lang === 'fr') {
      document.title = "Vox Roddy — L'assistant vocal ultime pour musiciens";
      langToggle.textContent = 'EN';
    } else {
      document.title = "Vox Roddy — The ultimate voice assistant for musicians";
      langToggle.textContent = 'FR';
    }

    // Toggle all translatable elements
    const translatables = document.querySelectorAll('[data-lang-fr]');
    translatables.forEach(el => {
      if (lang === 'fr') {
        el.textContent = el.getAttribute('data-lang-fr');
      } else {
        el.textContent = el.getAttribute('data-lang-en');
      }
    });

    // Update command cycling list according to language
    updateCommandList();
  }

  langToggle.addEventListener('click', () => {
    if (currentLang === 'fr') {
      setLanguage('en');
    } else {
      setLanguage('fr');
    }
  });

  // --- Dynamic Voice Commands Typing Effect ---
  const commandTextEl = document.getElementById('typing-command');
  
  const commandsFr = [
    'play"',
    'pause"',
    'c\'est parti !"',
    'plus vite"',
    'vitesse 4"',
    'cherche Led Zeppelin"',
    'ouvre 2"',
    'cherche Muse sur YouTube"'
  ];

  const commandsEn = [
    'play"',
    'pause"',
    'c\'est parti !"',
    'plus vite"',
    'vitesse 4"',
    'cherche Led Zeppelin"',
    'ouvre 2"',
    'cherche Muse sur YouTube"'
  ];

  let commandList = commandsFr;
  let currentCommandIndex = 0;
  let typingTimer;

  function updateCommandList() {
    commandList = currentLang === 'fr' ? commandsFr : commandsEn;
    currentCommandIndex = 0;
    clearTimeout(typingTimer);
    typeCommand();
  }

  function typeCommand() {
    const fullText = commandList[currentCommandIndex];
    let currentText = '';
    let letterIndex = 0;

    function type() {
      if (letterIndex < fullText.length) {
        currentText += fullText[letterIndex];
        commandTextEl.textContent = currentText;
        letterIndex++;
        typingTimer = setTimeout(type, 100);
      } else {
        // Wait before deleting / moving to the next
        typingTimer = setTimeout(erase, 2500);
      }
    }

    function erase() {
      if (currentText.length > 0) {
        currentText = currentText.slice(0, -1);
        commandTextEl.textContent = currentText;
        typingTimer = setTimeout(erase, 50);
      } else {
        currentCommandIndex = (currentCommandIndex + 1) % commandList.length;
        typingTimer = setTimeout(typeCommand, 300);
      }
    }

    type();
  }

  // Start command cycle
  typeCommand();

  // --- Visualizer Waves Animation ---
  const wavesContainer = document.getElementById('visualizer-waves');
  const wavesCount = 12;
  wavesContainer.innerHTML = ''; // Clear fallback waves

  // Create wave bars
  const waveBars = [];
  for (let i = 0; i < wavesCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    bar.style.height = '15px';
    wavesContainer.appendChild(bar);
    waveBars.push(bar);
  }

  // Animate wave heights randomly
  setInterval(() => {
    waveBars.forEach((bar, index) => {
      // Create a nice organic wave curve
      const factor = Math.sin(Date.now() * 0.004 + index * 0.5) * 0.5 + 0.5;
      const randomNoise = Math.random() * 30;
      const height = (factor * 50) + 10 + randomNoise;
      bar.style.height = `${height}px`;
    });
  }, 100);

  // --- Metronome Widget Demo ---
  const metroDots = document.querySelectorAll('#metro-preview .metro-dot');
  let currentMetroDot = 0;
  setInterval(() => {
    metroDots.forEach((dot, index) => {
      if (index === currentMetroDot) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
    currentMetroDot = (currentMetroDot + 1) % metroDots.length;
  }, 500); // 120 BPM (0.5s per beat)

  // --- Pitch Visualizer Demo ---
  const pitchPreview = document.getElementById('pitch-preview');
  pitchPreview.innerHTML = '';
  const pitchBarsCount = 14;
  const pitchBars = [];
  
  for (let i = 0; i < pitchBarsCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'pitch-bar';
    bar.style.height = '30%';
    pitchPreview.appendChild(bar);
    pitchBars.push(bar);
  }

  setInterval(() => {
    pitchBars.forEach((bar, index) => {
      const centerFactor = Math.sin(Date.now() * 0.001 + index * 0.3) * 30 + 50;
      const noise = Math.random() * 20 - 10;
      const height = Math.min(100, Math.max(10, centerFactor + noise));
      bar.style.height = `${height}%`;
      bar.style.opacity = (height / 100) * 0.7 + 0.3;
    });
  }, 150);

  // --- Chord Detector Demo ---
  const chordPreview = document.getElementById('chord-preview');
  const chords = ['Cmaj7', 'Am7', 'Fmaj7', 'G7', 'Dm9', 'G7alt', 'C6/9'];
  let currentChordIndex = 0;
  
  setInterval(() => {
    chordPreview.style.animation = 'none';
    // Trigger reflow
    void chordPreview.offsetWidth;
    
    currentChordIndex = (currentChordIndex + 1) % chords.length;
    chordPreview.textContent = chords[currentChordIndex];
    chordPreview.style.animation = 'pulse-chord 2s infinite';
  }, 3000);
});
