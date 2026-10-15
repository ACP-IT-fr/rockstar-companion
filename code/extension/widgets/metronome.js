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
  let metronomeRhythm = 'noire';
  // Facteur appliqué au gain des sous-temps (croches, doubles, etc.) pour
  // qu'ils restent derrière le temps lui-même, comme sur un vrai métronome.
  let gainScale = 1;
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
  // Lancer le métronome directement au tempo enregistré sur la fiche.
  const songTempoRegex = /^(?:(?:lance|démarre|demarre|joue)\s+le\s+|(?:mets|met)\s+le\s+métronome\s+au\s+)tempo\s+de\s+(?:la|cette)\s+chanson$|^song tempo$/i;
  // Réglage seul (sans lancement) : « tempo de la chanson », « mets le tempo
  // de la chanson ». La variante avec verbe d'action passe par la commande
  // Play ci-dessus (enregistrée avant, handleCommand s'arrête au premier match).
  const setSongTempoRegex = /^(?:mets|met)\s+le\s+tempo\s+de\s+(?:la|cette)\s+chanson$|^tempo\s+de\s+(?:la|cette)\s+chanson$/i;

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

  // --- Motifs rythmiques -------------------------------------------------------
  // Chaque motif répartit des événements sur UN temps (o = offset 0..1,
  // d = nombre de ligatures pour le dessin, rest = silence). Les motifs
  // irréguliers (n-olets) répartissent n croches égales sur le temps.
  const RHYTHM_PATTERNS = [
    { id: 'noire',    name: 'Noire',                         events: [{ o: 0, d: 0 }] },
    { id: 'croches',  name: 'Deux croches',                  events: [{ o: 0, d: 1 }, { o: 0.5, d: 1 }] },
    { id: 'triolet',  name: 'Triolet de croches',            events: [{ o: 0, d: 1 }, { o: 1 / 3, d: 1 }, { o: 2 / 3, d: 1 }], tuplet: 3 },
    { id: 'doubles',  name: 'Quatre doubles croches',        events: [{ o: 0, d: 2 }, { o: 0.25, d: 2 }, { o: 0.5, d: 2 }, { o: 0.75, d: 2 }] },
    { id: 'crocheDoubles', name: 'Croche et deux doubles',   events: [{ o: 0, d: 1 }, { o: 0.5, d: 2 }, { o: 0.75, d: 2 }] },
    { id: 'doublesCroche', name: 'Deux doubles et croche',   events: [{ o: 0, d: 2 }, { o: 0.25, d: 2 }, { o: 0.5, d: 1 }] },
    { id: 'pointee',  name: 'Croche pointée + double',       events: [{ o: 0, d: 1, dot: true }, { o: 0.75, d: 2 }] },
    { id: 'doublePointee', name: 'Double + croche pointée',  events: [{ o: 0, d: 2 }, { o: 0.5, d: 1, dot: true }] },
    { id: 'soupirCroche', name: 'Silence puis croche',       events: [{ o: 0, rest: true }, { o: 0.5, d: 1 }] },
    { id: 'crocheSoupir', name: 'Croche puis silence',       events: [{ o: 0, d: 1 }, { o: 0.5, rest: true }] },
    { id: 'silenceDoubles', name: 'Silence puis deux doubles', events: [{ o: 0, rest: true }, { o: 0.5, d: 2 }, { o: 0.75, d: 2 }] },
    { id: 'quintole', name: 'Quintole de croches',           events: [0, 1, 2, 3, 4].map((i) => ({ o: i / 5, d: 1 })), tuplet: 5 },
    { id: 'sextolet', name: 'Sextolet de croches',           events: [0, 1, 2, 3, 4, 5].map((i) => ({ o: i / 6, d: 2 })), tuplet: 6 },
    { id: 'septolet', name: 'Septolet de croches',           events: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ o: i / 7, d: 2 })), tuplet: 7 },
    { id: 'octolet',  name: 'Huit triples croches',          events: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ o: i / 8, d: 3 })), tuplet: 8 }
  ];

  function getRhythmPattern() {
    return RHYTHM_PATTERNS.find((p) => p.id === metronomeRhythm) || RHYTHM_PATTERNS[0];
  }

  function setMetronomeRhythm(id) {
    const p = RHYTHM_PATTERNS.find((x) => x.id === id);
    if (!p) return false;
    metronomeRhythm = id;
    persistMetronomeState();
    const grid = document.getElementById('metronome-rhythm-grid');
    if (grid) {
      Array.prototype.forEach.call(grid.children, (btn) => {
        btn.classList.toggle('active', btn.dataset.rhythm === id);
      });
    }
    updateRhythmCurrent();
    return true;
  }

  // Dessin de la figure en SVG inline (pas d'emoji, pas d'image externe) :
  // notes épaisses et rondes, hampes larges, ligatures strictement comprises
  // entre les hampes (aucun débord), chiffre du n-olet au-dessus.
  function rhythmGlyphSVG(events, tuplet) {
    const W = 46, H = 30;
    const xFor = (o) => 4 + o * 34;
    const parts = [];
    const notes = events.filter((e) => !e.rest);
    events.forEach((ev) => {
      const x = xFor(ev.o);
      if (ev.rest) {
        // Silence de croche : croche du glyphe + point, lisible à petite taille.
        parts.push(`<path d="M ${x + 6} 8 c 0 4 -2.5 7 -5.8 8.8 c 3.5 -3 4.6 -5 4.9 -8.8 Z M ${x + 1.2} 19 a 1.9 1.9 0 1 0 3.8 0 a 1.9 1.9 0 1 0 -3.8 0"/>`);
        return;
      }
      parts.push(`<ellipse cx="${x}" cy="21" rx="4.2" ry="3" transform="rotate(-20 ${x} 21)"/>`);
      parts.push(`<rect x="${x + 3}" y="7.2" width="2" height="13.8" rx="1"/>`);
      if (ev.dot) parts.push(`<circle cx="${x + 7}" cy="19.5" r="1.5"/>`);
    });
    if (notes.length === 1 && (notes[0].d || 0) > 0) {
      // Note isolée avec ligature : crochet court vers la droite.
      const x = xFor(notes[0].o) + 3.4;
      for (let b = 1; b <= notes[0].d; b++) {
        parts.push(`<rect x="${x}" y="${7.2 + (b - 1) * 3.8}" width="7.4" height="2.4" rx="0.8"/>`);
      }
    } else if (notes.length > 1) {
      // Ligatures par segment : entre deux notes voisines, profondeur commune
      // min(d_i, d_j), largeur arrêtée aux hampes. Une note plus rapide que sa
      // voisine reçoit un crochet (demi-ligature) orienté vers elle.
      for (let i = 0; i < notes.length - 1; i++) {
        const shared = Math.min(notes[i].d || 0, notes[i + 1].d || 0);
        if (shared < 1) continue;
        const x1 = xFor(notes[i].o) + 3.4, x2 = xFor(notes[i + 1].o) + 3.4;
        for (let b = 1; b <= shared; b++) {
          parts.push(`<rect x="${x1}" y="${7.2 + (b - 1) * 3.8}" width="${x2 - x1 + 2}" height="2.4" rx="0.8"/>`);
        }
      }
      notes.forEach((n, i) => {
        const d = n.d || 0;
        const left = i > 0 ? Math.min(d, notes[i - 1].d || 0) : 0;
        const right = i < notes.length - 1 ? Math.min(d, notes[i + 1].d || 0) : 0;
        const connected = Math.max(left, right);
        if (d <= connected) return;
        const x = xFor(n.o) + 3.4;
        // Crochet côté voisin le plus lié (à droite par défaut, sinon à gauche).
        const stubLeft = right >= left && i < notes.length - 1 ? false : i > 0;
        for (let b = connected + 1; b <= d; b++) {
          parts.push(`<rect x="${stubLeft ? x - 7.4 : x}" y="${7.2 + (b - 1) * 3.8}" width="7.4" height="2.4" rx="0.8"/>`);
        }
      });
    }
    if (tuplet) {
      parts.push(`<text x="${W / 2}" y="5.5" font-size="7" font-weight="600" text-anchor="middle" fill="currentColor">${tuplet}</text>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" fill="currentColor">${parts.join('')}</svg>`;
  }

  // BEGIN GENERATED METRONOME GLYPHS (npm run glyphs — contours Bravura)
const METRONOME_GLYPH_SVGS = {
  "noire": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/></svg>",
  "croches": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"21.21\" height=\"3.8\"/></svg>",
  "triolet": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(13.85 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"21.91\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(27.18 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"35.24\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"14.55\" height=\"3.8\"/><rect x=\"21.91\" y=\"9.24\" width=\"14.55\" height=\"3.8\"/><path transform=\"translate(25.48 1.34) scale(0.013 -0.013)\" d=\"M213 248C212 248 211 248 209 248L202 249C201 249 199 249 198 249C112 249 26 192 26 139C26 106 45 62 107 58L112 58C156 58 178 90 178 123L178 131C175 168 150 170 145 172C140 174 125 172 125 186L125 190C127 207 158 215 167 215C252 215 260 162 260 138L260 131C260 57 201 28 138 25C128 24 114 19 114 8C114-4 131-4 139-4C254-4 263-82 263-95C263-201 209-213 187-213C183-213 179-212 178-212C170-211 151-211 150-196L150-191C150-169 172-154 173-125C173-83 144-53 101-53C97-53 94-53 90-54C73-57 54-67 42-80C25-95 20-119 20-141C22-219 93-249 191-251L200-251C299-251 401-200 401-112L401-105C399-76 392-57 373-35C367-27 359-20 349-14L328-2L295 7C290 8 287 8 285 12C284 14 284 15 284 17C284 21 285 25 288 26C299 29 310 30 319 35C359 54 380 80 380 126C380 218 255 245 213 248Z\"/></svg>",
  "doubles": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(10.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"18.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(30.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"38.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/><rect x=\"8.57\" y=\"14.94\" width=\"11.21\" height=\"3.8\"/><rect x=\"18.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/><rect x=\"18.57\" y=\"14.94\" width=\"11.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"14.94\" width=\"11.21\" height=\"3.8\"/></svg>",
  "crocheDoubles": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(30.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"38.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"21.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"14.94\" width=\"11.21\" height=\"3.8\"/></svg>",
  "doublesCroche": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(10.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"18.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/><rect x=\"8.57\" y=\"14.94\" width=\"11.21\" height=\"3.8\"/><rect x=\"18.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/></svg>",
  "pointee": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><path transform=\"translate(12.52 29) scale(0.03 -0.03)\" d=\"M100 0C100 28 78 50 50 50C22 50 0 28 0 0C0-28 22-50 50-50C78-50 100-28 100 0Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(30.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"38.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"31.21\" height=\"3.8\"/><rect x=\"33.86\" y=\"14.94\" width=\"4.71\" height=\"3.8\"/></svg>",
  "doublePointee": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><path transform=\"translate(32.52 29) scale(0.03 -0.03)\" d=\"M100 0C100 28 78 50 50 50C22 50 0 28 0 0C0-28 22-50 50-50C78-50 100-28 100 0Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"21.21\" height=\"3.8\"/><rect x=\"8.57\" y=\"14.94\" width=\"4.71\" height=\"3.8\"/></svg>",
  "soupirCroche": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(8.04 30.22) scale(0.03 -0.03)\" d=\"M78-38C94-58 108-77 121-98C123-102 127-110 127-112C127-113 127-115 126-116C124-120 120-121 115-121C111-121 103-119 99-118C98-118 96-118 95-118L87-115C35-115 1-162 1-211C1-261 44-310 117-366C125-372 135-375 143-375C150-375 157-373 158-369C159-366 160-364 160-362C160-353 152-345 144-338C131-338 120-311 118-302C115-294 114-285 114-276C114-235 135-203 177-203C206-203 239-214 256-220L257-221C261-222 263-222 265-222C268-222 270-221 270-218C270-206 244-173 233-161C195-115 164-78 164-22C164-21 164-20 164-19L165-12C165-11 165-10 165-9C169 49 205 97 231 138C234 143 235 148 235 153C235 163 231 172 231 172C231 172 83 348 66 365C61 370 54 373 48 373C38 373 28 366 28 352C28 347 29 342 32 336C36 325 93 274 93 202C93 165 78 122 33 75C23 65 19 54 19 46C19 32 29 22 29 22Z\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(28.57 9.24) scale(0.03 -0.03)\" d=\"M238-790C238-790 264-695 264-617C264-492 212-374 149-274C98-195 56-109 40-13C37 3 29 9 19 9C8 9 0 6 0-6L0-245C66-257 161-393 197-478C212-512 221-569 221-628C221-673 214-720 197-765C195-771 194-776 194-780C194-796 204-805 210-809C216-813 233-807 238-790Z\"/></svg>",
  "crocheSoupir": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(28.04 30.22) scale(0.03 -0.03)\" d=\"M78-38C94-58 108-77 121-98C123-102 127-110 127-112C127-113 127-115 126-116C124-120 120-121 115-121C111-121 103-119 99-118C98-118 96-118 95-118L87-115C35-115 1-162 1-211C1-261 44-310 117-366C125-372 135-375 143-375C150-375 157-373 158-369C159-366 160-364 160-362C160-353 152-345 144-338C131-338 120-311 118-302C115-294 114-285 114-276C114-235 135-203 177-203C206-203 239-214 256-220L257-221C261-222 263-222 265-222C268-222 270-221 270-218C270-206 244-173 233-161C195-115 164-78 164-22C164-21 164-20 164-19L165-12C165-11 165-10 165-9C169 49 205 97 231 138C234 143 235 148 235 153C235 163 231 172 231 172C231 172 83 348 66 365C61 370 54 373 48 373C38 373 28 366 28 352C28 347 29 342 32 336C36 325 93 274 93 202C93 165 78 122 33 75C23 65 19 54 19 46C19 32 29 22 29 22Z\"/><path transform=\"translate(8.57 9.24) scale(0.03 -0.03)\" d=\"M238-790C238-790 264-695 264-617C264-492 212-374 149-274C98-195 56-109 40-13C37 3 29 9 19 9C8 9 0 6 0-6L0-245C66-257 161-393 197-478C212-512 221-569 221-628C221-673 214-720 197-765C195-771 194-776 194-780C194-796 204-805 210-809C216-813 233-807 238-790Z\"/></svg>",
  "silenceDoubles": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(8.04 30.22) scale(0.03 -0.03)\" d=\"M78-38C94-58 108-77 121-98C123-102 127-110 127-112C127-113 127-115 126-116C124-120 120-121 115-121C111-121 103-119 99-118C98-118 96-118 95-118L87-115C35-115 1-162 1-211C1-261 44-310 117-366C125-372 135-375 143-375C150-375 157-373 158-369C159-366 160-364 160-362C160-353 152-345 144-338C131-338 120-311 118-302C115-294 114-285 114-276C114-235 135-203 177-203C206-203 239-214 256-220L257-221C261-222 263-222 265-222C268-222 270-221 270-218C270-206 244-173 233-161C195-115 164-78 164-22C164-21 164-20 164-19L165-12C165-11 165-10 165-9C169 49 205 97 231 138C234 143 235 148 235 153C235 163 231 172 231 172C231 172 83 348 66 365C61 370 54 373 48 373C38 373 28 366 28 352C28 347 29 342 32 336C36 325 93 274 93 202C93 165 78 122 33 75C23 65 19 54 19 46C19 32 29 22 29 22Z\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(30.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"38.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"28.57\" y=\"9.24\" width=\"11.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"14.94\" width=\"11.21\" height=\"3.8\"/></svg>",
  "quintole": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(8.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"16.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(16.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"24.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(24.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"32.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(32.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"40.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"9.21\" height=\"3.8\"/><rect x=\"16.57\" y=\"9.24\" width=\"9.21\" height=\"3.8\"/><rect x=\"24.57\" y=\"9.24\" width=\"9.21\" height=\"3.8\"/><rect x=\"32.57\" y=\"9.24\" width=\"9.21\" height=\"3.8\"/><path transform=\"translate(25.48 1.34) scale(0.013 -0.013)\" d=\"M76 59C76 59 80 115 81 124C82 132 87 137 96 137L100 137C110 135 157 128 198 128C337 128 342 208 342 224C342 237 339 245 328 245C315 245 237 236 205 236C173 236 87 244 70 246C52 246 47 237 46 229L35 7L35 5C35-8 45-10 55-10C65-10 66-1 77 10C87 20 111 43 145 43C179 43 248 24 248-87C248-197 189-211 163-211C155-211 147-211 140-208C135-205 129-201 128-194C128-187 135-183 140-180C163-166 178-141 178-113C178-69 143-35 100-35C46-35 24-74 21-109C20-115 20-121 20-127C20-210 74-251 197-251C317-251 383-177 383-87C383 4 309 78 218 78C160 78 117 68 85 49C83 48 81 48 80 48C76 48 76 52 76 55Z\"/></svg>",
  "sextolet": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(7.18 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"15.24\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(13.85 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"21.91\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(27.18 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"35.24\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(33.85 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"41.91\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"7.88\" height=\"3.8\"/><rect x=\"8.57\" y=\"14.94\" width=\"7.88\" height=\"3.8\"/><rect x=\"15.24\" y=\"9.24\" width=\"7.88\" height=\"3.8\"/><rect x=\"15.24\" y=\"14.94\" width=\"7.88\" height=\"3.8\"/><rect x=\"21.91\" y=\"9.24\" width=\"7.88\" height=\"3.8\"/><rect x=\"21.91\" y=\"14.94\" width=\"7.88\" height=\"3.8\"/><rect x=\"28.57\" y=\"9.24\" width=\"7.88\" height=\"3.8\"/><rect x=\"28.57\" y=\"14.94\" width=\"7.88\" height=\"3.8\"/><rect x=\"35.24\" y=\"9.24\" width=\"7.88\" height=\"3.8\"/><rect x=\"35.24\" y=\"14.94\" width=\"7.88\" height=\"3.8\"/><path transform=\"translate(25.48 1.34) scale(0.013 -0.013)\" d=\"M305 83C347 83 385 116 385 159C385 163 385 166 384 170C374 234 296 251 242 251C166 250 95 213 59 145C37 103 20 50 20 3L20-1C21-47 29-99 51-139C92-213 141-249 225-249C270-249 320-242 356-213C391-185 414-140 414-95C414-17 340 50 263 50C231 50 198 38 172 15C170 13 168 13 166 13C160 13 157 21 157 37C160 222 219 227 240 227C260 227 273 222 273 212C273 198 254 186 248 174C243 165 241 155 241 145C241 130 246 115 256 104C263 91 292 83 305 83ZM222 2C254 2 281-48 281-110C281-172 254-222 222-222C190-222 164-172 164-110C164-48 190 2 222 2Z\"/></svg>",
  "septolet": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(6.23 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"14.29\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(11.94 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"20\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(17.66 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"25.71\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(23.37 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"31.43\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(29.09 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"37.14\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(34.8 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"42.86\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"6.93\" height=\"3.8\"/><rect x=\"8.57\" y=\"14.94\" width=\"6.93\" height=\"3.8\"/><rect x=\"14.29\" y=\"9.24\" width=\"6.93\" height=\"3.8\"/><rect x=\"14.29\" y=\"14.94\" width=\"6.93\" height=\"3.8\"/><rect x=\"20\" y=\"9.24\" width=\"6.93\" height=\"3.8\"/><rect x=\"20\" y=\"14.94\" width=\"6.93\" height=\"3.8\"/><rect x=\"25.71\" y=\"9.24\" width=\"6.93\" height=\"3.8\"/><rect x=\"25.71\" y=\"14.94\" width=\"6.93\" height=\"3.8\"/><rect x=\"31.43\" y=\"9.24\" width=\"6.93\" height=\"3.8\"/><rect x=\"31.43\" y=\"14.94\" width=\"6.93\" height=\"3.8\"/><rect x=\"37.14\" y=\"9.24\" width=\"6.93\" height=\"3.8\"/><rect x=\"37.14\" y=\"14.94\" width=\"6.93\" height=\"3.8\"/><path transform=\"translate(25.48 1.34) scale(0.013 -0.013)\" d=\"M421 204C421 231 421 244 404 244C403 244 387 240 383 233C376 221 362 164 337 164C312 164 265 249 182 249C124 249 109 226 95 213C81 200 75 196 68 195C60 195 47 209 42 219C40 223 35 226 30 226C25 226 20 223 20 214L20 49C20 49 21 33 31 33C39 33 42 42 46 53C56 78 69 136 114 136C154 136 202 61 260 61C288 61 302 76 310 82C313 84 317 86 319 86C323 86 325 83 326 77C326 49 249-7 189-78C151-122 120-180 120-219C120-240 120-250 139-250C157-250 179-241 204-241C229-241 276-250 286-250C296-250 302-242 302-213C302-46 421 97 421 200Z\"/></svg>",
  "octolet": "<svg viewBox=\"0 0 54 40\" width=\"54\" height=\"40\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"currentColor\"><path transform=\"translate(0.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"8.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(5.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"13.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(10.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"18.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(15.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"23.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(20.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"28.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(25.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"33.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(30.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"38.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><path transform=\"translate(35.52 29) scale(0.03 -0.03)\" d=\"M97-125C186-125 295-43 295 42C295 93 255 125 198 125C88 125 0 44 0-42C0-94 43-125 97-125Z\"/><rect x=\"43.57\" y=\"9.24\" width=\"1.21\" height=\"19.76\"/><rect x=\"8.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"8.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"8.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><rect x=\"13.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"13.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"13.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><rect x=\"18.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"18.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"18.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><rect x=\"23.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"23.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"23.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"28.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><rect x=\"33.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"33.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"33.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><rect x=\"38.57\" y=\"9.24\" width=\"6.21\" height=\"3.8\"/><rect x=\"38.57\" y=\"14.94\" width=\"6.21\" height=\"3.8\"/><rect x=\"38.57\" y=\"20.64\" width=\"6.21\" height=\"3.8\"/><path transform=\"translate(25.48 1.34) scale(0.013 -0.013)\" d=\"M334 36C370 59 394 92 394 142C394 244 247 259 220 259C104 259 25 206 25 122C25 53 64 16 112-11C60-36 20-69 20-132C20-219 110-259 209-259C309-259 416-216 416-81C416-21 381 12 334 36ZM282 59C202 87 117 104 117 167C117 209 174 230 218 230C250 230 335 214 335 144C335 104 315 78 282 59ZM205-226C138-226 77-192 77-127C77-87 112-50 156-33C229-65 303-86 303-152C303-192 272-226 205-226Z\"/></svg>"
};
// END GENERATED METRONOME GLYPHS

  // Les motifs restent affichés en GLYPHES (figures de notation), mais
  // repliés derrière le motif courant : fermé, le sélecteur ne prend qu'une
  // ligne ; un clic ouvre la grille complète. Noms et figures pilotés par
  // RHYTHM_PATTERNS (un ajout suffit).
  function updateRhythmCurrent() {
    const cur = document.getElementById('metronome-rhythm-current');
    if (!cur) return;
    const p = getRhythmPattern();
    cur.innerHTML = METRONOME_GLYPH_SVGS[p.id] || rhythmGlyphSVG(p.events, p.tuplet);
    cur.title = 'Rythme : ' + p.name;
  }

  function setRhythmPickerOpen(open) {
    const grid = document.getElementById('metronome-rhythm-grid');
    const cur = document.getElementById('metronome-rhythm-current');
    if (!grid || !cur) return;
    grid.hidden = !open;
    cur.classList.toggle('open', open);
    cur.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeRhythmPicker() {
    setRhythmPickerOpen(false);
  }

  function renderRhythmPicker() {
    const grid = document.getElementById('metronome-rhythm-grid');
    if (!grid) return;
    grid.innerHTML = '';
    RHYTHM_PATTERNS.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'metronome-rhythm-btn' + (p.id === metronomeRhythm ? ' active' : '');
      btn.dataset.rhythm = p.id;
      btn.title = p.name;
      btn.innerHTML = METRONOME_GLYPH_SVGS[p.id] || rhythmGlyphSVG(p.events, p.tuplet);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMetronomeRhythm(p.id);
        closeRhythmPicker();
      });
      grid.appendChild(btn);
    });
    updateRhythmCurrent();
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
    gainNode.gain.linearRampToValueAtTime(gain * metronomeVolume * gainScale, time + attack);
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
    gainNode.gain.setValueAtTime(1.1 * metronomeVolume * gainScale, time);
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

    const secondsPerBeat = 60.0 / metronomeBpm;
    const isAccent = (metronomeTimeSignature !== '1/4' && beatIndex === 0);
    const kit = SOUND_KITS[metronomeSoundType] || SOUND_KITS.wood;

    // Le motif répartit des événements sur le temps : le premier sonne
    // normalement, les suivants sont des sous-temps plus discrets ; les
    // silences ne sonnent pas (l'indicateur à points reste inchangé).
    getRhythmPattern().events.forEach((ev) => {
      const evTime = time + ev.o * secondsPerBeat;
      if (ev.rest) return;
      if (ev.o === 0) {
        (isAccent ? kit.accent : kit.weak)(audioContext, evTime);
      } else {
        gainScale = 0.55;
        kit.weak(audioContext, evTime);
        gainScale = 1;
      }
    });

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

  // --- Persistance de l'état (dernier tempo, dernier motif) --------------------
  // Le métronome reprend au prochain lancement là où on l'a laissé : sans
  // override (bouton ♪ de la chanson, voix), le dernier BPM reste affiché.
  const METRONOME_STATE_KEY = 'metronome_state';

  function persistMetronomeState() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.set({ [METRONOME_STATE_KEY]: { bpm: metronomeBpm, rhythm: metronomeRhythm } });
    } catch (e) { /* contexte d'extension indisponible : rien à persister */ }
  }

  function restoreMetronomeState() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(METRONOME_STATE_KEY, (res) => {
        const st = res && res[METRONOME_STATE_KEY];
        if (st && st.bpm) setMetronomeBpm(st.bpm);
        if (st && st.rhythm) setMetronomeRhythm(st.rhythm);
      });
    } catch (e) { /* idem */ }
  }

  function setMetronomeBpm(newBpm) {
    metronomeBpm = Math.max(40, Math.min(240, newBpm));
    persistMetronomeState();

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

  // Lancement direct : applique le tempo de la fiche PUIS démarre le
  // métronome — un seul geste pour jouer avec le bon tempo.
  function playSongTempo() {
    const tempo = getSongTempo();
    if (!tempo) return false;
    applySongTempo();
    startMetronome();
    return true;
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
    name: 'Play Song Tempo',
    relayAction: 'Lancement au tempo de la chanson (panneau)',
    regex: songTempoRegex,
    handler: () => {
      const tempo = getSongTempo();
      if (!tempo) {
        return { success: false, action: 'Aucun tempo défini pour cette chanson' };
      }
      playSongTempo();
      return { success: true, action: `Métronome lancé à ${tempo} BPM (tempo de la chanson)` };
    }
  });

  registerMetronomeCommand({
    name: 'Set Song Tempo',
    relayAction: 'Tempo de la chanson appliqué (panneau)',
    regex: setSongTempoRegex,
    handler: () => {
      const tempo = getSongTempo();
      if (!tempo) {
        return { success: false, action: 'Aucun tempo défini pour cette chanson' };
      }
      applySongTempo();
      return { success: true, action: `Tempo du métronome réglé sur ${tempo} BPM (tempo de la chanson)` };
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

  const metronomeRhythmRegex = /^(?:rythme|rhythm|motif|figure)\s*(?:de\s+|en\s+)?(noire|noires|croches|croche pointée|croche pointee|double pointée|double pointee|double croche|doubles croches|croche et deux doubles|deux doubles et croche|triolet|triolet de croches|silence puis croche|croche puis silence|silence puis deux doubles|quintole|quintolet|sextolet|septolet|octolet)$/i;

  const RHYTHM_VOICE_MAP = {
    'noire': 'noire', 'noires': 'noire',
    'croches': 'croches',
    'triolet': 'triolet', 'triolet de croches': 'triolet',
    'double croche': 'doubles', 'doubles croches': 'doubles',
    'croche et deux doubles': 'crocheDoubles', 'deux doubles et croche': 'doublesCroche',
    'croche pointée': 'pointee', 'croche pointee': 'pointee',
    'double pointée': 'doublePointee', 'double pointee': 'doublePointee',
    'silence puis croche': 'soupirCroche', 'croche puis silence': 'crocheSoupir',
    'silence puis deux doubles': 'silenceDoubles',
    'quintole': 'quintole', 'quintolet': 'quintole',
    'sextolet': 'sextolet', 'septolet': 'septolet', 'octolet': 'octolet'
  };

  registerMetronomeCommand({
    name: 'Set Metronome Rhythm',
    relayAction: 'Rythme du métronome réglé (panneau)',
    regex: metronomeRhythmRegex,
    handler: (cmdText, match) => {
      const id = RHYTHM_VOICE_MAP[match[1].toLowerCase()];
      if (id && setMetronomeRhythm(id)) {
        return { success: true, action: `Rythme réglé sur ${getRhythmPattern().name}` };
      }
      return { success: false, action: `Rythme inconnu: ${match[1]}` };
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
  window.RockstarCore.registerHelpCommand({ label: "🎵 Tempo de la chanson", cmd: "lance le tempo de la chanson", env: "tab" });

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
      <div class="metronome-rhythm-picker">
        <button id="metronome-rhythm-current" class="metronome-rhythm-current" title="Rythme" aria-expanded="false" aria-controls="metronome-rhythm-grid"></button>
        <div class="metronome-rhythm-grid" id="metronome-rhythm-grid" hidden></div>
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

    metronomeContainer.querySelector('#metronome-rhythm-current').addEventListener('click', (e) => {
      e.stopPropagation();
      const grid = metronomeContainer.querySelector('#metronome-rhythm-grid');
      setRhythmPickerOpen(grid.hidden);
    });
    // Fermeture au clic ailleurs sur la page (enregistre une seule fois).
    if (!window.__rockstarRhythmOutsideClose) {
      window.__rockstarRhythmOutsideClose = true;
      document.addEventListener('click', (e) => {
        const picker = document.querySelector('.metronome-rhythm-picker');
        if (picker && !picker.contains(e.target)) closeRhythmPicker();
      });
    }

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
    renderRhythmPicker();
    restoreMetronomeState();
    updateSongTempoButton();
    if (metronomeFlashScreen) {
      createScreenFlashOverlay();
    }
  });

  // Expose play methods
  window.RockstarCore.startMetronome = startMetronome;
  window.RockstarCore.stopMetronome = stopMetronome;
  // Lancement direct au tempo de la fiche : en mode panneau latéral, le
  // widget ne se monte pas dans la page — on relaie la commande au panneau
  // (même hub que les commandes vocales), sinon on démarre localement.
  window.RockstarCore.playSongTempo = () => {
    if (shouldRelayToPanel()) {
      try {
        chrome.runtime.sendMessage({ type: 'rockstar:metronome-relay', text: 'lance le tempo de la chanson' }, (res) => {
          if (chrome.runtime.lastError) void chrome.runtime.lastError;
          if (!res || !res.relayed) playSongTempo(); // panneau fermé : secours local
        });
        return;
      } catch (e) { /* contexte d'extension invalide : secours local */ }
    }
    playSongTempo();
  };
  // Réglage seul (sans lancement) : bouton ▶ de la fiche.
  window.RockstarCore.setSongTempo = () => {
    if (shouldRelayToPanel()) {
      try {
        chrome.runtime.sendMessage({ type: 'rockstar:metronome-relay', text: 'mets le tempo de la chanson' }, (res) => {
          if (chrome.runtime.lastError) void chrome.runtime.lastError;
          if (!res || !res.relayed) applySongTempo(); // panneau fermé : secours local
        });
        return;
      } catch (e) { /* contexte d'extension invalide : secours local */ }
    }
    applySongTempo();
  };
  // Tempo exposé pour le pill flottant (puce Tempo ± )
  window.RockstarCore.getMetronomeBpm = () => metronomeBpm;
  window.RockstarCore.setMetronomeBpm = (bpm) => setMetronomeBpm(Math.round(bpm));
  // Motifs exposés pour les tests hors navigateur (fractions, silences, n-olets)
  window.RockstarCore.metronomeRhythmPatterns = RHYTHM_PATTERNS;
})();
