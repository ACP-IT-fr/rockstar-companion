const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.warn("Web Speech API not supported in this browser.");
} else {
  let isListening = false;
  let scrollInterval = null;
  const recognition = new SpeechRecognition();
  
  recognition.continuous = true;
  recognition.interimResults = true;
  // Use the browser's default language or default to en-US.
  recognition.lang = navigator.language || 'en-US';

  const btn = document.createElement('button');
  btn.id = 'ug-voice-btn';
  btn.innerHTML = '🎤';
  btn.title = 'Click to enable voice control';
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
      startListening();
    }
  });

  function startListening() {
    try {
      recognition.start();
      isListening = true;
      btn.classList.add('listening');
      btn.title = 'Listening... Click to stop';
    } catch (e) {
      console.error("Speech recognition error:", e);
    }
  }

  function stopListening() {
    recognition.stop();
    isListening = false;
    btn.classList.remove('listening');
    btn.title = 'Click to enable voice control';
    stopScrolling();
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
      if (event.results[i].isFinal) {
        const finalTranscript = transcript.trim().toLowerCase();
        console.log("Voice Command Recognized:", finalTranscript);
        liveTextContainer.innerText = '';
        liveTextContainer.style.display = 'none';
        handleCommand(finalTranscript);
      } else {
        interimTranscript += transcript;
      }
    }
    
    if (interimTranscript.trim() !== '') {
      liveTextContainer.innerText = interimTranscript;
      liveTextContainer.style.display = 'block';
    }
  };
  
  recognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    if (event.error === 'not-allowed') {
      stopListening();
      alert("Microphone permission denied. Please allow microphone access to use voice commands.");
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
}
