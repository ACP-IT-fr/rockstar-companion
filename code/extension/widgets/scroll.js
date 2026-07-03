// widgets/scroll.js
(function() {
  if (!window.RockstarCore) return;

  let currentDirection = 0;
  let accumulatedScroll = 0;
  let scrollInterval = null;
  let lastSpeedChange = 0;
  const storageKey = 'ug_voice_speed_' + window.location.pathname;

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

  // Command variants
  const scrollDownVariants = ['scroll down', 'en bas', 'plus bas', 'go down', 'down', 'bas', 'c\'est parti', 'c’est parti', 'défile', 'défiler', 'dé file', 'dé filer', 'des files', 'des file', 'dé fil', 'des fil', 'défilement', 'glisse', 'glisser'];
  const scrollDownSmallVariants = ['descends', 'descend', 'descendre', 'dessein', 'descends un peu', 'descend un peu', 'descendre un peu', 'un peu plus bas', 'petite descente', 'scroll down a bit', 'scroll down a little', 'down a little', 'down a bit'];
  const scrollDownLargeVariants = ['descends beaucoup', 'descend beaucoup', 'descendre beaucoup', 'beaucoup plus bas', 'grande descente', 'scroll down a lot', 'down a lot', 'scroll down page'];
  const scrollUpSmallVariants = ['remonte', 'monte un peu', 'monter un peu', 'remonte un peu', 'remonter un peu', 'un peu plus haut', 'petite montée', 'petite montee', 'scroll up a bit', 'scroll up a little', 'up a little', 'up a bit'];
  const scrollUpLargeVariants = ['monte beaucoup', 'monter beaucoup', 'remonte beaucoup', 'remonter beaucoup', 'beaucoup plus haut', 'grande montée', 'grande montee', 'scroll up a lot', 'up a lot', 'scroll up page'];
  const topVariants = ['début', 'debut', 'tout en haut', 'go to top', 'top', 'reviens', 'commencement'];
  const speedUpVariants = ['plus vite', 'faster', 'accélère', 'accelere', 'go faster', 'speed up'];
  const slowDownVariants = ['moins vite', 'slower', 'ralentis', 'go slower', 'speed down'];
  const pauseVariants = ['pause', 'pose', 'stop scroll', 'arrête le scroll', 'arrete le scroll', 'fige', 'bloque', 'suspend'];

  function startScrolling(direction) {
    stopScrolling();
    currentDirection = direction;
    accumulatedScroll = 0;
    
    const speedContainer = document.getElementById('ug-voice-speed');
    if (speedContainer) speedContainer.classList.add('visible');
    
    scrollInterval = setInterval(() => {
      accumulatedScroll += currentDirection * (window.RockstarCore.scrollSpeed / 10);
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
      const speedContainer = document.getElementById('ug-voice-speed');
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

  function setSpeed(val) {
    const newSpeed = Math.max(1, Math.min(val, 10));
    window.RockstarCore.scrollSpeed = newSpeed;
    localStorage.setItem(storageKey, newSpeed);
  }

  function adjustSpeed(delta) {
    setSpeed(window.RockstarCore.scrollSpeed + delta);
  }

  // Enregistrer les commandes
  window.RockstarCore.registerCommand({
    name: 'Scroll Down',
    variants: scrollDownVariants,
    handler: () => {
      startScrolling(1);
      return { success: true, action: 'Défilement bas' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Scroll Down Bit',
    variants: scrollDownSmallVariants,
    handler: () => {
      discreteScroll(200);
      return { success: true, action: 'Défilement bas léger' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Scroll Down A Lot',
    variants: scrollDownLargeVariants,
    handler: () => {
      discreteScroll(500);
      return { success: true, action: 'Défilement bas important' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Scroll Up Bit',
    variants: scrollUpSmallVariants,
    handler: () => {
      discreteScroll(-200);
      return { success: true, action: 'Défilement haut léger' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Scroll Up A Lot',
    variants: scrollUpLargeVariants,
    handler: () => {
      discreteScroll(-500);
      return { success: true, action: 'Défilement haut important' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Go to Top',
    variants: topVariants,
    handler: () => {
      stopScrolling();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { success: true, action: 'Retour en haut' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Pause Scroll',
    variants: pauseVariants,
    handler: () => {
      stopScrolling();
      
      let videoPaused = false;
      const ytPlayer = document.querySelector('.html5-video-player') || document.getElementById('movie_player');
      const video = window.RockstarCore.getActiveVideo ? window.RockstarCore.getActiveVideo() : null;
      
      if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
        videoPaused = true;
      } else if (video) {
        video.pause();
        videoPaused = true;
      }
      
      if (window.RockstarCore.getActiveDrawerPlaybackLink) {
        const activeDrawerLink = window.RockstarCore.getActiveDrawerPlaybackLink();
        if (activeDrawerLink && activeDrawerLink.type === 'youtube' && window.RockstarCore.sendYouTubeCommand) {
          window.RockstarCore.sendYouTubeCommand('pauseVideo');
          videoPaused = true;
        }
      }
      
      return { 
        success: true, 
        action: videoPaused ? 'Pause vidéo & défilement' : 'Pause défilement' 
      };
    }
  });

  // Gestion de la vitesse par commande vocale (Regex pour vitesse précise)
  const speedSetRegex = new RegExp("(?:vitesse|speed|niveau|level)\\s*(?:numéro|numero|number|num|n°|#)?\\s*" + numPattern + "\\b", "i");
  window.RockstarCore.registerCommand({
    name: 'Set Speed',
    regex: speedSetRegex,
    handler: (cmdText, match) => {
      const val = textToNum[match[1].toLowerCase()];
      if (val) {
        setSpeed(val);
        return { success: true, action: `Vitesse réglée à ${val}` };
      }
      return { success: false, action: 'Vitesse invalide' };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Increase Speed',
    variants: speedUpVariants,
    handler: () => {
      adjustSpeed(1);
      return { success: true, action: `Plus vite (Vitesse ${window.RockstarCore.scrollSpeed})` };
    }
  });

  window.RockstarCore.registerCommand({
    name: 'Decrease Speed',
    variants: slowDownVariants,
    handler: () => {
      adjustSpeed(-1);
      return { success: true, action: `Moins vite (Vitesse ${window.RockstarCore.scrollSpeed})` };
    }
  });

  // Enregistrer les commandes d'aide pour le panneau flottant
  window.RockstarCore.registerHelpCommand({ label: "⬇️ Défiler vers le bas", cmd: "défile", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "⏸️ Pause Scroll", cmd: "pause", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "🔝 Retour en haut", cmd: "go to top", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "🔽 Descendre un peu", cmd: "descends un peu", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "🔼 Monter un peu", cmd: "monte un peu", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "⚡ Défiler plus vite", cmd: "plus vite", env: "tab" });
  window.RockstarCore.registerHelpCommand({ label: "⚡ Défiler plus lent", cmd: "moins vite", env: "tab" });

  // S'abonner aux changements d'état d'écoute
  window.RockstarCore.onListeningChanged((isListening) => {
    if (!isListening) {
      stopScrolling();
    }
  });

  // Exposer les méthodes utiles
  window.RockstarCore.stopScrolling = stopScrolling;
  window.RockstarCore.startScrolling = startScrolling;
})();
