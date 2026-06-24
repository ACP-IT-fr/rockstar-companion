const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.warn("Web Speech API not supported in this browser.");
} else {
  let isListening = false;
  let isAwake = false;
  let isAutoStart = false;
  let awakeTimeout = null;
  let scrollInterval = null;
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
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      
      // Wake up early on interim results for instant feedback
      if (!isAwake) {
        const lowerTrans = transcript.toLowerCase();
        if (lowerTrans.includes('rockstar') || lowerTrans.includes('rock star') || lowerTrans.includes('roxstar')) {
          wakeUp();
        }
      }
      
      if (event.results[i].isFinal) {
        let finalTranscript = transcript.trim().toLowerCase();
        console.log("Voice Command Recognized:", finalTranscript);
        liveTextContainer.innerText = '';
        liveTextContainer.style.display = 'none';
        
        const wakeWords = ['rockstar', 'rock star', 'roxstar'];
        const foundWakeWord = wakeWords.find(ww => finalTranscript.includes(ww));

        if (foundWakeWord) {
          // In case interim didn't catch it
          if (!isAwake) wakeUp();
          finalTranscript = finalTranscript.replace(foundWakeWord, '').trim();
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
        interimTranscript += transcript;
      }
    }
    
    if (interimTranscript.trim() !== '') {
      if (!isAwake && !interimTranscript.toLowerCase().includes('rockstar') && !interimTranscript.toLowerCase().includes('rock star')) {
        // Optionally don't show live text if not awake and not saying wake word
        liveTextContainer.style.display = 'none';
      } else {
        liveTextContainer.innerText = interimTranscript;
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
    if (command.includes('scroll down') || command.includes('descend') || command.includes('descends')) {
      startScrolling(1);
      action = 'Scrolling down';
    } else if (command.includes('scroll up') || command.includes('monte')) {
      startScrolling(-1);
      action = 'Scrolling up';
    } else if (command.includes('stop') || command.includes('arrête')) {
      stopScrolling();
      action = 'Stopping';
    } else if (command.startsWith('search for ') || command.startsWith('search ')) {
      const query = command.replace('search for ', '').replace('search ', '');
      searchUG(query);
      action = `Searching for "${query}"`;
    } else if (command.startsWith('cherche ')) {
      const query = command.replace('cherche ', '');
      searchUG(query);
      action = `Searching for "${query}"`;
    } else {
      isSuccess = false;
      action = 'Unrecognized command';
    }
    
    showFeedback(`🎤 Heard: "${command}"\n${action}`, isSuccess);
  }

  function startScrolling(direction) {
    stopScrolling();
    scrollInterval = setInterval(() => {
      window.scrollBy(0, direction * 2);
    }, 20); // 50 fps, 2 pixels per frame
  }

  function stopScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }

  function searchUG(query) {
    const url = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`;
    window.location.href = url;
  }

  // Attempt to auto-start listening when the page loads
  startListening(true);
}
