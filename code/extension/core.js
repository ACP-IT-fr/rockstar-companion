// core.js
(function() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("[RockstarCore] Web Speech API not supported in this browser.");
  }

  // Registres internes
  const registeredCommands = [];
  const initHooks = [];
  const helpCommands = [];
  const visibilityHandlers = [];
  
  // Variables d'état communes
  let scrollSpeed = 1;
  let isListening = false;
  let isAwake = false;
  let isAutoStart = false;
  let isSuspendedByVisibility = false;
  let audioContext = null;
  let analyser = null;
  
  const currentDomain = window.location.hostname;
  
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

  // Chargement initial de la vitesse de scroll sauvegardée
  const storageKey = 'ug_voice_speed_' + window.location.pathname;
  const savedSpeed = localStorage.getItem(storageKey);
  if (savedSpeed) {
    const parsed = parseInt(savedSpeed, 10);
    if (!isNaN(parsed)) scrollSpeed = Math.max(1, Math.min(parsed, 10));
  }

  // Fonctions de stockage sécurisées (avec fallback localStorage)
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

  function safeStorageSyncGet(keys, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(keys, callback);
    } else {
      const result = {};
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(k => {
        const val = localStorage.getItem('sync_' + k);
        let parsed = null;
        if (val !== null) {
          try {
            parsed = JSON.parse(val);
          } catch (e) {
            parsed = val;
          }
        }
        result[k] = parsed;
      });
      callback(result);
    }
  }

  function safeStorageSyncSet(obj, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(obj, callback);
    } else {
      for (const [k, v] of Object.entries(obj)) {
        localStorage.setItem('sync_' + k, typeof v === 'object' ? JSON.stringify(v) : v);
      }
      if (callback) callback();
    }
  }

  // AudioContext unique partagé
  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function getAnalyser() {
    return analyser;
  }

  function setAnalyser(newAnalyser) {
    analyser = newAnalyser;
  }

  // Récupération de l'élément vidéo actif
  function getActiveVideo() {
    // 1. YouTube main player
    const ytVideo = document.querySelector('video');
    if (ytVideo && window.location.hostname.includes('youtube.com')) {
      return ytVideo;
    }
    // 2. Iframe YouTube (dans le drawer)
    const iframe = document.querySelector('#drawer-youtube-iframe');
    if (iframe) {
      // Pour l'API IFrame YouTube, on n'obtient pas directement l'élément HTML5 video de l'iframe cross-origin.
    }
    // Fallback standard
    return document.querySelector('video');
  }

  // Création ou récupération de la barre flottante d'action
  function getOrCreateFloatingBar() {
    let bar = document.getElementById('rockstar-floating-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rockstar-floating-bar';
      document.body.appendChild(bar);
    }
    return bar;
  }

  // Router de commande vocale principal
  function handleCommand(transcript) {
    const cmd = transcript.toLowerCase().trim();
    let isSuccess = false;
    let actionName = 'Commande non reconnue';

    function hasWord(text, word) {
      return text.split(/\s+/).includes(word);
    }

    for (const def of registeredCommands) {
      let isMatch = false;
      if (def.variants && def.variants.some(v => cmd === v || hasWord(cmd, v))) {
        isMatch = true;
      } else if (def.regex && cmd.match(def.regex)) {
        isMatch = true;
      }

      if (isMatch) {
        const matchResult = def.regex ? cmd.match(def.regex) : null;
        const result = def.handler(cmd, matchResult);
        isSuccess = result.success;
        actionName = result.action || def.name;
        break;
      }
    }

    if (window.RockstarCore.showFeedback) {
      window.RockstarCore.showFeedback(`🎤 Heard: "${transcript}"\n${actionName}`, isSuccess);
    }
    return isSuccess;
  }

  // Écouteur du changement de visibilité de l'onglet
  document.addEventListener('visibilitychange', () => {
    visibilityHandlers.forEach(handler => {
      try {
        handler(document.hidden);
      } catch (e) {
        console.error("[RockstarCore] Error in visibility handler:", e);
      }
    });
  });

  const settingsListeners = [];
  let settingsLoaded = false;
  const settings = {
    chord7th: false,
    chordSus: false,
    wakeWord: 'Rockstar',
    wakeWordLower: 'rockstar',
    allowedDomains: {},
    muteAllSites: false,
    inactivityDelay: 1
  };

  function updateSettings(newSettings) {
    Object.assign(settings, newSettings);
    if (settings.wakeWord) {
      settings.wakeWordLower = settings.wakeWord.toLowerCase().trim();
    }
    settingsListeners.forEach(listener => {
      try {
        listener(settings);
      } catch (e) {
        console.error("[RockstarCore] Error executing settings listener:", e);
      }
    });
  }

  function loadSettings(callback) {
    safeStorageSyncGet(['chord7th', 'chordSus', 'wakeWord', 'allowedDomains', 'muteAllSites', 'inactivityDelay'], (result) => {
      const chord7th = result.chord7th || false;
      const chordSus = result.chordSus || false;
      const wakeWord = result.wakeWord !== undefined && result.wakeWord !== null ? (String(result.wakeWord).trim() || 'Rockstar') : 'Rockstar';
      const allowedDomains = result.allowedDomains || {};
      const muteAllSites = result.muteAllSites || false;
      const inactivityDelay = result.inactivityDelay !== undefined && result.inactivityDelay !== null ? parseInt(result.inactivityDelay, 10) : 1;
      
      updateSettings({ chord7th, chordSus, wakeWord, allowedDomains, muteAllSites, inactivityDelay });
      settingsLoaded = true;
      if (callback) callback();
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        loadSettings();
      }
    });
  }

  const listeningListeners = [];
  const awakeListeners = [];

  // Définition de l'objet global RockstarCore
  window.RockstarCore = {
    // Enregistrement
    registerCommand: (def) => registeredCommands.push(def),
    registerInit: (fn) => initHooks.push(fn),
    registerHelpCommand: (helpCmd) => helpCommands.push(helpCmd),
    registerVisibilityHandler: (fn) => visibilityHandlers.push(fn),
    
    // Accès aux registres
    getHelpCommands: () => helpCommands,
    getRegisteredCommands: () => registeredCommands,
    
    // Utilitaires
    safeStorageGet,
    safeStorageSet,
    safeStorageRemove,
    safeStorageSyncGet,
    safeStorageSyncSet,
    getAudioContext,
    getAnalyser,
    setAnalyser,
    getActiveVideo,
    getOrCreateFloatingBar,
    handleCommand,
    
    // Gestion des préférences
    get settings() { return settings; },
    onSettingsChanged: (fn) => {
      settingsListeners.push(fn);
      if (settingsLoaded) {
        try {
          fn(settings);
        } catch (e) {
          console.error("[RockstarCore] Error executing immediate settings listener:", e);
        }
      }
    },
    
    // Écouteurs de changement d'état
    onListeningChanged: (fn) => {
      listeningListeners.push(fn);
      try { fn(isListening); } catch(e) { console.error(e); }
    },
    onAwakeChanged: (fn) => {
      awakeListeners.push(fn);
      try { fn(isAwake); } catch(e) { console.error(e); }
    },
    
    // État commun (getter/setter)
    get scrollSpeed() { return scrollSpeed; },
    set scrollSpeed(val) { 
      scrollSpeed = val;
      const speedIndicator = document.getElementById('ug-voice-speed');
      if (speedIndicator) speedIndicator.innerText = 'Speed: ' + scrollSpeed;
    },
    
    get isListening() { return isListening; },
    set isListening(val) { 
      isListening = val;
      listeningListeners.forEach(fn => {
        try { fn(isListening); } catch(e) { console.error("[RockstarCore] Error in listening listener:", e); }
      });
    },
    
    get isAwake() { return isAwake; },
    set isAwake(val) { 
      isAwake = val;
      awakeListeners.forEach(fn => {
        try { fn(isAwake); } catch(e) { console.error("[RockstarCore] Error in awake listener:", e); }
      });
    },
    
    get isAutoStart() { return isAutoStart; },
    set isAutoStart(val) { isAutoStart = val; },
    
    get isSuspendedByVisibility() { return isSuspendedByVisibility; },
    set isSuspendedByVisibility(val) { isSuspendedByVisibility = val; },
    
    get currentDomain() { return currentDomain; },
    get activeSiteKey() { return activeSiteKey; },
    get activeConfig() { return activeConfig; },
    
    // Stubs d'interface utilisateur et de moteur vocal (qui seront redéfinis par les modules chargés)
    showFeedback: null,
    wakeUp: null,
    goToSleep: null,
    stopListening: null,
    startListening: null,
    appendButtonsToFloatingBar: null,
    showActivationBanner: null,
    removeActivationBanner: null,

    // Initialisation globale
    initialize: () => {
      loadSettings(() => {
        // Déclencher tous les hooks d'initialisation des widgets
        initHooks.forEach(hook => {
          try {
            hook();
          } catch (e) {
            console.error("[RockstarCore] Error executing init hook:", e);
          }
        });
      });
    }
  };

  // Lancement automatique de l'initialisation après le chargement de la page
  window.addEventListener('load', () => {
    // Laisser un temps pour que tous les scripts soient injectés et enregistrés
    setTimeout(() => {
      window.RockstarCore.initialize();
    }, 100);
  });
})();
