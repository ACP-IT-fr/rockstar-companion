// voiceEngine.js
(function() {
  if (!window.RockstarCore) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let awakeTimeout = null;
  let inactivityTimeoutId = null;
  let lastInterimTranscript = '';
  let interimFinalizeTimeout = null;
  
  // Paramètres récupérés de RockstarCore
  let wakeWord = 'Roddy';
  let wakeWordLower = 'roddy';
  let inactivityDelay = 1;

  window.RockstarCore.onSettingsChanged((settings) => {
    wakeWord = settings.wakeWord || 'Roddy';
    wakeWordLower = settings.wakeWordLower || 'roddy';
    
    const oldDelay = inactivityDelay;
    inactivityDelay = settings.inactivityDelay !== undefined ? settings.inactivityDelay : 1;
    
    if (window.RockstarCore.isListening && oldDelay !== inactivityDelay) {
      resetInactivityTimer();
    }
  });

  // Normalisation du texte
  function normalize(text) {
    let normalized = text.toLowerCase()
               .replace(/[\u2019’]/g, "'")
               .replace(/-/g, ' ')
               .trim()
               .replace(/\b(?:repair|reap here|repare|repaire|re\s+père|re-père)\b/g, 'repère');
    
    if (wakeWordLower === 'roddy') {
      normalized = normalized.replace(/\b(?:roadie|roady|rody|rhody|ruddy|rudy|rodi|roddi)\b/g, 'roddy');
    } else if (wakeWordLower === 'rockstar') {
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
        console.log(`[RockstarVoice] Stopping listening due to ${inactivityDelay} min inactivity`);
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
        recognition.start();
        resetInactivityTimer();
        
        if (!auto) {
          wakeUp(15000, true);
        } else {
          window.RockstarCore.safeStorageGet('rockstar_awake_until', (res) => {
            const now = Date.now();
            const remaining = res.rockstar_awake_until ? (res.rockstar_awake_until - now) : 0;
            if (remaining > 0) {
              wakeUp(remaining, false);
            } else {
              goToSleep();
            }
          });
        }
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
          console.log("Voice Command Recognized:", finalTranscript);

          const liveText = document.getElementById('ug-voice-live-text');
          if (liveText) {
            liveText.innerText = '';
            liveText.style.display = 'none';
          }

          if (normalized.includes(wakeWordLower)) {
            if (finalTranscript.length > 0) {
              const success = window.RockstarCore.handleCommand(finalTranscript);
              if (success) {
                if (window.RockstarCore.isAwake) {
                  wakeUp(5000, false);
                }
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
          } else if (window.RockstarCore.isAwake) {
            const success = window.RockstarCore.handleCommand(finalTranscript);
            if (success) {
              if (window.RockstarCore.isAwake) {
                wakeUp(5000, false);
              }
            } else {
              if (finalTranscript.split(/\s+/).length > 3) {
                goToSleep();
              } else {
                wakeUp(3000, false);
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

      const liveText = document.getElementById('ug-voice-live-text');
      if (interimRaw.trim() !== '') {
        const normalizedInterim = normalize(interimRaw);
        const wordCount = normalizedInterim.trim().split(/\s+/).length;
        if (wordCount > 10) {
          if (liveText) liveText.style.display = 'none';
          recognition.stop();
          return;
        }

        if (liveText) {
          if (!window.RockstarCore.isAwake && !normalizedInterim.includes(wakeWordLower)) {
            liveText.style.display = 'none';
          } else {
            let displayInterim = normalizedInterim;
            if (normalizedInterim.includes(wakeWordLower)) {
              const wakeIndex = normalizedInterim.lastIndexOf(wakeWordLower);
              displayInterim = normalizedInterim.substring(wakeIndex).trim();
            }
            liveText.innerText = displayInterim;
            liveText.style.display = 'block';
          }
        }
      }

      if (window.RockstarCore.isAwake && lastInterimTranscript.trim() !== '') {
        interimFinalizeTimeout = setTimeout(() => {
          console.log("[RockstarVoice] Auto-finalizing interim speech:", lastInterimTranscript);
          const transcriptToExecute = lastInterimTranscript;
          lastInterimTranscript = '';
          if (liveText) {
            liveText.innerText = '';
            liveText.style.display = 'none';
          }
          wakeUp(15000, false);
          window.RockstarCore.handleCommand(transcriptToExecute);
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
      if (window.RockstarCore.isListening && !window.RockstarCore.isSuspendedByVisibility) {
        setTimeout(() => {
          if (window.RockstarCore.isListening && !window.RockstarCore.isSuspendedByVisibility) {
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
