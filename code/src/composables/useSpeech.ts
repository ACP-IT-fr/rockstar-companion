import { ref, readonly } from 'vue';

// Dictionnaire de commandes vocales facilement modifiable.
// Pour ajouter une commande ou un synonyme, il suffit de modifier cette structure.
export interface CommandDefinition {
  action: string;
  keywords: string[];
}

export const COMMAND_DICTIONARY: Record<'fr-FR' | 'en-US', CommandDefinition[]> = {
  'fr-FR': [
    { action: 'next', keywords: ['suivant', 'suivante', 'chanson suivante', 'morceau suivant'] },
    { action: 'prev', keywords: ['précédent', 'précédente', 'retour', 'chanson précédente', 'morceau précédent'] },
    { action: 'scroll-down', keywords: ['descends', 'descendre', 'plus bas', 'défile bas'] },
    { action: 'scroll-up', keywords: ['monte', 'monter', 'plus haut', 'défile haut'] },
    { action: 'scroll-top', keywords: ['haut', 'début', 'tout en haut', 'revenir en haut'] },
    { action: 'play', keywords: ['play', 'lecture', 'joue', 'lancer', 'démarrer'] },
    { action: 'pause', keywords: ['pause', 'stop lecture', 'arrêter musique'] },
    { action: 'rewind', keywords: ['recule', 'reculer', 'retour 10 secondes', 'reculer de 10 secondes'] },
    { action: 'restart', keywords: ['recommence', 'recommencer', 'depuis le début', 'rembobiner'] },
    { action: 'metronome-stop', keywords: ['stop métronome', 'arrêter métronome', 'métronome stop', 'couper métronome'] },
    { action: 'metronome-start', keywords: ['métronome', 'lance métronome', 'démarrer métronome'] }, // Sera validé par regex pour le BPM
    { action: 'tuner-toggle', keywords: ['accordeur', 'tuner', 'activer accordeur', 'désactiver accordeur'] }
  ],
  'en-US': [
    { action: 'next', keywords: ['next', 'next song', 'next track', 'forward'] },
    { action: 'prev', keywords: ['previous', 'prev', 'back', 'previous song', 'previous track'] },
    { action: 'scroll-down', keywords: ['scroll down', 'down', 'page down'] },
    { action: 'scroll-up', keywords: ['scroll up', 'up', 'page up'] },
    { action: 'scroll-top', keywords: ['top', 'scroll to top', 'start of page'] },
    { action: 'play', keywords: ['play', 'resume', 'start music', 'play song'] },
    { action: 'pause', keywords: ['pause', 'stop', 'freeze', 'stop music'] },
    { action: 'rewind', keywords: ['rewind', 'go back', 'back 10 seconds'] },
    { action: 'restart', keywords: ['restart', 'start over', 'replay'] },
    { action: 'metronome-stop', keywords: ['stop metronome', 'metronome stop', 'turn off metronome'] },
    { action: 'metronome-start', keywords: ['metronome', 'start metronome', 'play metronome'] }, // Regex matching for BPM
    { action: 'tuner-toggle', keywords: ['tuner', 'guitar tuner', 'toggle tuner'] }
  ]
};

export function useSpeech() {
  const isListening = ref(false);
  const lastRecognizedText = ref('');
  const errorMsg = ref('');
  
  let recognition: SpeechRecognition | null = null;
  let onCommandCallback: ((action: string, arg?: any) => void) | null = null;

  const initRecognition = (locale: 'fr-FR' | 'en-US') => {
    // Check browser support
    const SpeechRecognitionClass = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      errorMsg.value = 'Speech recognition not supported in this browser.';
      return null;
    }

    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = locale;

    rec.onstart = () => {
      isListening.value = true;
      errorMsg.value = '';
    };

    rec.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        errorMsg.value = 'Microphone permission denied.';
      } else {
        errorMsg.value = `Error: ${event.error}`;
      }
      isListening.value = false;
    };

    rec.onend = () => {
      isListening.value = false;
      // Auto-restart if we want continuous listening and didn't stop explicitly
      if (recognition && isListening.value) {
        try {
          recognition.start();
        } catch (e) {
          console.error(e);
        }
      }
    };

    rec.onresult = (event: any) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript.trim().toLowerCase();
      lastRecognizedText.value = transcript;
      console.log('Recognized speech:', transcript);
      
      processSpeechText(transcript, locale);
    };

    recognition = rec;
    return rec;
  };

  const processSpeechText = (text: string, locale: 'fr-FR' | 'en-US') => {
    if (!onCommandCallback) return;

    // 1. Check for metronome with BPM (dynamic command)
    // French match: "métronome 120"
    // English match: "metronome 120"
    const metronomeRegex = locale === 'fr-FR' 
      ? /m[eé]tronome\s+(\d+)/i 
      : /metronome\s+(\d+)/i;
      
    const match = text.match(metronomeRegex);
    if (match && match[1]) {
      const bpmValue = parseInt(match[1], 10);
      if (bpmValue >= 40 && bpmValue <= 240) {
        onCommandCallback('metronome-start-bpm', bpmValue);
        return;
      }
    }

    // 2. Exact or fuzzy match keywords from dictionary
    const dict = COMMAND_DICTIONARY[locale];
    for (const cmd of dict) {
      for (const keyword of cmd.keywords) {
        // Use inclusive matching, e.g. if voice input contains the keyword, fire action
        if (text.includes(keyword)) {
          onCommandCallback(cmd.action);
          return;
        }
      }
    }
  };

  const startListening = (locale: 'fr-FR' | 'en-US', callback: (action: string, arg?: any) => void) => {
    onCommandCallback = callback;
    
    // Re-initialize if language changed
    if (recognition && recognition.lang !== locale) {
      recognition.stop();
      recognition = null;
    }

    if (!recognition) {
      initRecognition(locale);
    }

    if (recognition && !isListening.value) {
      try {
        recognition.start();
        // Fallback flag set because recognition.start() fires onstart asynchronously
        isListening.value = true; 
      } catch (e) {
        console.error('Failed to start recognition', e);
      }
    }
  };

  const stopListening = () => {
    if (recognition && isListening.value) {
      recognition.stop();
      isListening.value = false;
    }
  };

  return {
    isListening: readonly(isListening),
    lastRecognizedText: readonly(lastRecognizedText),
    errorMsg: readonly(errorMsg),
    startListening,
    stopListening,
    commandsDictionary: COMMAND_DICTIONARY
  };
}
export type SpeechRecognitionType = any;
