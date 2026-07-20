// voiceEngine.js
(function() {
  if (!window.RockstarCore) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let awakeTimeout = null;
  let inactivityTimeoutId = null;
  let lastInterimTranscript = '';
  let interimFinalizeTimeout = null;
  
  const rawHistory = [];
  const commandHistory = [];

  function updateRawDisplay(currentInterim = '') {
    const rawValEl = document.querySelector('#ug-voice-live-raw .ug-voice-bar-value');
    let historyText = rawHistory.join(' | ');
    if (currentInterim) {
      historyText = (historyText ? historyText + ' > ' : '') + currentInterim;
    }
    const displayText = historyText || (window.RockstarCore.isListening ? 'Écoute...' : 'Silencieux');
    if (rawValEl) {
      rawValEl.innerText = displayText;
    }
    window.dispatchEvent(new CustomEvent('rockstar-voice-raw', { detail: { text: displayText } }));
  }

  function addRawSentence(sentence) {
    if (!sentence || sentence.trim() === '') return;
    rawHistory.push(sentence.trim());
    if (rawHistory.length > 2) {
      rawHistory.shift();
    }
    updateRawDisplay();
  }

  function addCommand(cmd) {
    if (!cmd || cmd.trim() === '') return;
    commandHistory.push(cmd.trim());
    if (commandHistory.length > 3) {
      commandHistory.shift();
    }
    const histValEl = document.querySelector('#ug-voice-live-history .ug-voice-bar-value');
    if (histValEl) {
      histValEl.innerText = commandHistory.join(', ');
    }
    const lastValEl = document.querySelector('#ug-voice-live-last .ug-voice-bar-value');
    if (lastValEl) {
      lastValEl.innerText = cmd.trim().toUpperCase();
    }
  }

  // Paramètres récupérés de RockstarCore
  let wakeWord = 'Roddy';
  let wakeWordLower = 'roddy';
  let wakeWordVariants = 'roadie, roady, rody, rhody, ruddy, rudy, rodi, roddi, redis, kodi';
  let inactivityDelay = 1;
  let wakeActiveDuration = 10;

  window.RockstarCore.onSettingsChanged((settings) => {
    wakeWord = settings.wakeWord || 'Roddy';
    wakeWordLower = settings.wakeWordLower || 'roddy';
    wakeWordVariants = settings.wakeWordVariants !== undefined ? settings.wakeWordVariants : 'roadie, roady, rody, rhody, ruddy, rudy, rodi, roddi, redis, kodi';
    wakeActiveDuration = settings.wakeActiveDuration !== undefined ? settings.wakeActiveDuration : 10;
    
    const oldDelay = inactivityDelay;
    inactivityDelay = settings.inactivityDelay !== undefined ? settings.inactivityDelay : 1;
    
    if (window.RockstarCore.isListening && oldDelay !== inactivityDelay) {
      resetInactivityTimer();
    }
    updateRawDisplay();
  });

  // Normalisation du texte
  function normalize(text) {
    let normalized = text.toLowerCase()
               .replace(/[\u2019’]/g, "'")
               .replace(/-/g, ' ')
               .trim()
               .replace(/\b(?:repair|reap here|repare|repaire|re\s+père|re-père)\b/g, 'repère');
    
    if (wakeWordVariants) {
      const variantsList = wakeWordVariants.split(',')
                            .map(v => v.trim().toLowerCase())
                            .filter(v => v.length > 0);
      if (variantsList.length > 0) {
        const escapedVariants = variantsList.map(v => v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
        const pattern = '\\b(?:' + escapedVariants.join('|') + ')\\b';
        const regex = new RegExp(pattern, 'g');
        normalized = normalized.replace(regex, wakeWordLower);
      }
    }

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

  // Minuteur d'inactivité
  function resetInactivityTimer() {
    if (inactivityTimeoutId) {
      clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = null;
    }
    
    if (inactivityDelay <= 0) return;
    
    const duration = inactivityDelay * 60 * 1000;
    
    inactivityTimeoutId = setTimeout(() => {
      // Si le métronome joue ou s'il y a une vidéo en cours de lecture, on repousse la veille
      const video = window.RockstarCore.getActiveVideo();
      if (video && !video.paused) {
        resetInactivityTimer();
        return;
      }
      
      if (window.RockstarCore.isListening) {
        stopListening();
        if (window.RockstarCore.showFeedback) {
          window.RockstarCore.showFeedback(`🎤 Micro fermé par inactivité (${inactivityDelay} min)`, true);
        }
      }
    }, duration);
  }

  function registerInactivityListeners() {
    const events = ['click', 'keydown', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, () => {
        if (window.RockstarCore.isListening) {
          resetInactivityTimer();
        }
      }, { passive: true });
    });
  }

  function wakeUp(timeoutMs = 15000, showToast = true) {
    window.RockstarCore.isAwake = true;
    const awakeUntil = Date.now() + timeoutMs;
    window.RockstarCore.awakeUntil = awakeUntil;
    window.RockstarCore.awakeDuration = timeoutMs;
    window.RockstarCore.safeStorageSet({ rockstar_awake_until: awakeUntil });
    
    if (showToast && window.RockstarCore.showFeedback) {
      window.RockstarCore.showFeedback(`🎸 ${wakeWord} is listening...`, true);
    }
    
    clearTimeout(awakeTimeout);
    awakeTimeout = setTimeout(() => {
      goToSleep();
    }, timeoutMs);
  }

  function goToSleep() {
    window.RockstarCore.isAwake = false;
    window.RockstarCore.awakeUntil = null;
    window.RockstarCore.awakeDuration = null;
    window.RockstarCore.safeStorageRemove('rockstar_awake_until');
    if (window.RockstarCore.showFeedback) {
      window.RockstarCore.showFeedback(`💤 ${wakeWord} is sleeping...`, true);
    }
  }

  function startListening(auto = false) {
    window.RockstarCore.isAutoStart = auto;
    window.RockstarCore.isSuspendedByVisibility = false;
    
    if (!window.RockstarCore.isListening) {
      try {
        window.RockstarCore.isListening = true;
        resetInactivityTimer();
        
        if (document.hidden) {
          window.RockstarCore.isSuspendedByVisibility = true;
        } else {
          recognition.start();
        }
        
        if (!auto) {
          wakeUp(Math.max(15000, wakeActiveDuration * 1000), true);
        } else {
          window.RockstarCore.safeStorageGet(['rockstar_awake_until', 'rockstar_wake_on_load'], (res) => {
            if (res && res.rockstar_wake_on_load === true) {
              window.RockstarCore.safeStorageRemove('rockstar_wake_on_load');
              wakeUp(Math.max(15000, wakeActiveDuration * 1000), true);
            } else {
              const now = Date.now();
              const remaining = res && res.rockstar_awake_until ? (res.rockstar_awake_until - now) : 0;
              if (remaining > 0) {
                wakeUp(remaining, false);
              } else {
                goToSleep();
              }
            }
          });
        }
        updateRawDisplay();
      } catch (e) {
        console.error("Speech recognition could not start", e);
        window.RockstarCore.isListening = false;
      }
    } else {
      stopListening();
    }
  }

  function stopListening() {
    window.RockstarCore.isListening = false;
    window.RockstarCore.isSuspendedByVisibility = false;
    
    if (inactivityTimeoutId) {
      clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = null;
    }
    
    try {
      recognition.stop();
    } catch (e) { }
    
    window.RockstarCore.isAwake = false;
    window.RockstarCore.safeStorageRemove('rockstar_awake_until');
    updateRawDisplay();
  }

  // Hook d'initialisation du moteur de reconnaissance
  window.RockstarCore.registerInit(() => {
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';

    recognition.onresult = (event) => {
      resetInactivityTimer();
      let interimRaw = '';
      clearTimeout(interimFinalizeTimeout);

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        const normalized = normalize(transcript);
        
        if (!window.RockstarCore.isAwake) {
          if (normalized.includes(wakeWordLower)) {
            wakeUp();
          }
        }

        let activeText = normalized;
        if (normalized.includes(wakeWordLower)) {
          const wakeIndex = normalized.lastIndexOf(wakeWordLower);
          activeText = normalized.substring(wakeIndex + wakeWordLower.length).trim();
        }

        if (event.results[i].isFinal) {
          clearTimeout(interimFinalizeTimeout);
          lastInterimTranscript = '';
          let finalTranscript = activeText;

          // Add raw transcript to speech history
          addRawSentence(transcript);

          if (normalized.includes(wakeWordLower)) {
            if (finalTranscript.length > 0) {
              const success = window.RockstarCore.handleCommand(finalTranscript);
              if (success) {
                addCommand(finalTranscript);
                if (window.RockstarCore.isAwake) {
                  wakeUp(wakeActiveDuration * 1000, false);
                }
              } else {
                if (finalTranscript.split(/\s+/).length > 3) {
                  goToSleep();
                } else {
                  wakeUp(wakeActiveDuration * 1000, false);
                }
              }
            } else {
              wakeUp(wakeActiveDuration * 1000, true);
            }
          } else if (window.RockstarCore.isAwake) {
            const success = window.RockstarCore.handleCommand(finalTranscript);
            if (success) {
              addCommand(finalTranscript);
              if (window.RockstarCore.isAwake) {
                wakeUp(wakeActiveDuration * 1000, false);
              }
            } else {
              if (finalTranscript.split(/\s+/).length > 3) {
                goToSleep();
              } else {
                wakeUp(Math.max(3000, Math.round(wakeActiveDuration * 1000 * 0.6)), false);
              }
            }
          }
          
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
          updateRawDisplay();
          recognition.stop();
          return;
        }

        if (!window.RockstarCore.isAwake && !normalizedInterim.includes(wakeWordLower)) {
          updateRawDisplay();
        } else {
          let displayInterim = normalizedInterim;
          if (normalizedInterim.includes(wakeWordLower)) {
            const wakeIndex = normalizedInterim.lastIndexOf(wakeWordLower);
            displayInterim = normalizedInterim.substring(wakeIndex).trim();
          }
          updateRawDisplay(displayInterim);
        }
      }

      if (window.RockstarCore.isAwake && lastInterimTranscript.trim() !== '') {
        interimFinalizeTimeout = setTimeout(() => {
          const transcriptToExecute = lastInterimTranscript;
          lastInterimTranscript = '';
          
          addRawSentence(transcriptToExecute);
          
          wakeUp(Math.max(15000, wakeActiveDuration * 1000), false);
          const success = window.RockstarCore.handleCommand(transcriptToExecute);
          if (success) {
            addCommand(transcriptToExecute);
          }
        }, 1200);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        stopListening();
        if (!window.RockstarCore.isAutoStart) {
          alert("Microphone permission denied. Please allow microphone access to use voice commands.");
        }
      }
    };

    recognition.onend = () => {
      if (window.RockstarCore.isListening && !window.RockstarCore.isSuspendedByVisibility && !document.hidden) {
        setTimeout(() => {
          if (window.RockstarCore.isListening && !window.RockstarCore.isSuspendedByVisibility && !document.hidden) {
            try {
              recognition.start();
            } catch (e) {
              console.error("Error restarting recognition", e);
            }
          }
        }, 100);
      }
    };

    // Gestionnaires pour l'enregistrement d'inactivité
    registerInactivityListeners();

    // Hook de visibilité d'onglet partagé
    window.RockstarCore.registerVisibilityHandler((hidden) => {
      if (hidden) {
        if (window.RockstarCore.isListening && !window.RockstarCore.isSuspendedByVisibility) {
          window.RockstarCore.isSuspendedByVisibility = true;
          try {
            recognition.stop();
          } catch (e) {}
        }
      } else {
        if (window.RockstarCore.isSuspendedByVisibility) {
          window.RockstarCore.isSuspendedByVisibility = false;
          if (window.RockstarCore.isListening) {
            try {
              recognition.start();
            } catch (e) {}
          }
        }
      }
    });

    // Lancement de démarrage automatique ou bannière d'activation
    const isUG = window.RockstarCore.currentDomain.endsWith('ultimate-guitar.com');
    const settings = window.RockstarCore.settings;
    const status = settings.allowedDomains[window.RockstarCore.currentDomain];

    if (isUG || status === true) {
      // Démarrage automatique silencieux au chargement
      startListening(true);
    } else if (status === undefined && !settings.muteAllSites) {
      if (window.RockstarCore.showActivationBanner) {
        window.RockstarCore.showActivationBanner();
      }
    }
  });

  // Exposer les méthodes publiques
  window.RockstarCore.startListening = startListening;
  window.RockstarCore.stopListening = stopListening;
  window.RockstarCore.wakeUp = wakeUp;
  window.RockstarCore.goToSleep = goToSleep;

  // Enregistrer la commande de mise en veille vocale
  const sleepVariants = ['dors', 'endors', 'sleep', 'merci', 'c\'est tout'];
  window.RockstarCore.registerCommand({
    name: 'Go to Sleep',
    variants: sleepVariants,
    handler: () => {
      goToSleep();
      return { success: true, action: 'Mise en veille' };
    }
  });
})();
