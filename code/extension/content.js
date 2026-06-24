const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.warn("Web Speech API not supported in this browser.");
} else {
  let isListening = false;
  let isAwake = false;
  let isAutoStart = false;
  let awakeTimeout = null;
  let scrollInterval = null;
  let scrollSpeed = 5; // Default speed 5
  let currentDirection = 0;
  let accumulatedScroll = 0;
  const recognition = new SpeechRecognition();
  
  recognition.continuous = true;
  recognition.interimResults = true;
  // Use the browser's default language or default to en-US.
  recognition.lang = navigator.language || 'en-US';

  const btn = document.createElement('button');
  btn.id = 'ug-voice-btn';
  
  const iconSpan = document.createElement('span');
  iconSpan.innerText = '🎤';
  
  const statusSpan = document.createElement('span');
  statusSpan.id = 'ug-voice-status';
  statusSpan.innerText = 'Off';
  
  btn.appendChild(iconSpan);
  btn.appendChild(statusSpan);
  btn.title = 'Voice control OFF. Click to enable';
  document.body.appendChild(btn);

  const feedbackContainer = document.createElement('div');
  feedbackContainer.id = 'ug-voice-feedback';
  document.body.appendChild(feedbackContainer);

  const liveTextContainer = document.createElement('div');
  liveTextContainer.id = 'ug-voice-live-text';
  document.body.appendChild(liveTextContainer);

  const speedContainer = document.createElement('div');
  speedContainer.id = 'ug-voice-speed';
  speedContainer.innerText = 'Speed: ' + scrollSpeed;
  document.body.appendChild(speedContainer);

  function updateSpeedUI() {
    speedContainer.innerText = 'Speed: ' + scrollSpeed;
  }

  function showFeedback(text, isSuccess) {
    const toast = document.createElement('div');
    toast.className = 'ug-voice-toast ' + (isSuccess ? 'success' : 'error');
    toast.innerText = text;
    feedbackContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  btn.addEventListener('click', () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(false);
    }
  });

  function startListening(auto = false) {
    isAutoStart = auto;
    try {
      recognition.start();
      isListening = true;
      btn.classList.add('listening');
      statusSpan.innerText = 'Veille';
      btn.title = 'Listening for "Rockstar"... Click to turn off';
    } catch (e) {
      console.error("Speech recognition error:", e);
    }
  }

  function stopListening() {
    recognition.stop();
    isListening = false;
    isAwake = false;
    btn.classList.remove('listening', 'awake');
    statusSpan.innerText = 'Off';
    btn.title = 'Voice control OFF. Click to enable';
    stopScrolling();
  }

  function wakeUp() {
    isAwake = true;
    btn.classList.add('awake');
    statusSpan.innerText = "À l'écoute";
    showFeedback("🎸 Rockstar is listening...", true);
    clearTimeout(awakeTimeout);
    awakeTimeout = setTimeout(() => {
      goToSleep();
    }, 15000); // 15 seconds awake
  }

  function goToSleep() {
    isAwake = false;
    btn.classList.remove('awake');
    statusSpan.innerText = 'Veille';
    showFeedback("💤 Rockstar is sleeping...", true);
  }

  recognition.onend = () => {
    // Auto-restart if we are supposed to be listening
    if (isListening) {
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
      return text.toLowerCase()
                 .replace(/-/g, ' ') // Remove hyphens that break commands
                 .replace(/rock\s*star/g, 'rockstar') // Unify wake word
                 .replace(/roxstar/g, 'rockstar')
                 .replace(/rock's tar/g, 'rockstar')
                 .trim();
    }

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      const normalized = normalize(transcript);
      
      // Wake up early on interim results for instant feedback
      if (!isAwake) {
        if (normalized.includes('rockstar')) {
          wakeUp();
        }
      }
      
      if (event.results[i].isFinal) {
        let finalTranscript = normalized;
        console.log("Voice Command Recognized:", finalTranscript);
        liveTextContainer.innerText = '';
        liveTextContainer.style.display = 'none';

        if (finalTranscript.includes('rockstar')) {
          // In case interim didn't catch it
          if (!isAwake) wakeUp();
          finalTranscript = finalTranscript.replace('rockstar', '').trim();
          if (finalTranscript.length > 0) {
            handleCommand(finalTranscript);
          }
        } else if (isAwake) {
          // Restart awake timeout since user spoke while awake
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
      if (!isAwake && !normalizedInterim.includes('rockstar')) {
        // Optionally don't show live text if not awake and not saying wake word
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

  function handleCommand(command) {
    let action = '';
    let isSuccess = true;
    const cmd = command.toLowerCase().trim();

    const scrollDownVariants = ['scroll down', 'descend', 'dessin', 'descent', 'en bas', 'plus bas', 'go down', 'down', 'bas'];
    const scrollUpVariants = ['scroll up', 'monte', 'montre', 'en haut', 'plus haut', 'go up', 'up', 'haut', 'remonte'];
    const pauseVariants = ['pause', 'stop scroll', 'arrête le scroll', 'arrete le scroll', 'fige', 'bloque', 'suspend'];
    const sleepVariants = ['stop', 'arrête', 'arrete', 'arrêt', 'arret', 'stoppe', 'stopper', 'stopp', 'dors', 'endors', 'sleep', 'merci', 'c\'est tout'];
    const topVariants = ['début', 'debut', 'tout en haut', 'go to top', 'top', 'reviens', 'commencement'];
    const speedUpVariants = ['faster', 'speed up', 'plus vite', 'accélère', 'accelere', 'accélérer', 'accelerer', 'acceler', 'accélér', 'plus rapide'];
    const slowDownVariants = ['slower', 'slow down', 'moins vite', 'ralentis', 'ralenti', 'ralentir', 'doucement', 'plus doucement', 'moins rapide'];
    const searchPlaylistPrefixes = [
      'playlist search ', 'search playlist ', 
      'cherche dans ma playlist ', 'chercher dans ma playlist ', 'cherche dans mes playlists ', 'chercher dans mes playlists ',
      'cherche playlist ', 'chercher playlist ',
      'trouve dans ma playlist ', 'trouver dans ma playlist ', 'trouve dans mes playlists ', 'trouver dans mes playlists '
    ];
    const searchPrefixes = ['search for ', 'search ', 'cherche ', 'chercher ', 'trouve ', 'trouver ', 'find '];

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
    } else if (speedUpVariants.some(v => cmd === v || cmd.includes(v))) {
      scrollSpeed = Math.min(scrollSpeed + 1, 10);
      updateSpeedUI();
      action = `Speeding up (Level ${scrollSpeed})`;
    } else if (slowDownVariants.some(v => cmd === v || cmd.includes(v))) {
      scrollSpeed = Math.max(scrollSpeed - 1, 1);
      updateSpeedUI();
      action = `Slowing down (Level ${scrollSpeed})`;
    } else {
      let isSearch = false;
      
      // Try playlist search first to avoid overlapping with generic search
      for (const prefix of searchPlaylistPrefixes) {
        if (cmd.startsWith(prefix)) {
          const query = cmd.substring(prefix.length).trim();
          if (query) {
            searchPlaylistUG(query);
            action = `Searching playlist for "${query}"`;
            isSearch = true;
            break;
          }
        }
      }

      // If not playlist search, try generic search
      if (!isSearch) {
        for (const prefix of searchPrefixes) {
          if (cmd.startsWith(prefix)) {
            const query = cmd.substring(prefix.length).trim();
            if (query) {
              searchUG(query);
              action = `Searching for "${query}"`;
              isSearch = true;
              break;
            }
          }
        }
      }
      
      if (!isSearch) {
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
    
    // Show the speed container when scrolling starts
    speedContainer.classList.add('visible');
    
    scrollInterval = setInterval(() => {
      // Divide speed by 10 for much finer control (0.1 to 1.0 pixels per frame)
      accumulatedScroll += currentDirection * (scrollSpeed / 10);
      
      if (Math.abs(accumulatedScroll) >= 1) {
        let pixels = Math.trunc(accumulatedScroll);
        window.scrollBy(0, pixels);
        accumulatedScroll -= pixels;
      }
    }, 20); // 50 fps
  }

  function stopScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
      speedContainer.classList.remove('visible');
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

  // Attempt to auto-start listening when the page loads
  startListening(true);
  
  // Highlight best results if we are on a search page
  highlightBestResults();
}
