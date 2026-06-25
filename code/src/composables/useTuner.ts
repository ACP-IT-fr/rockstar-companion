import { ref, readonly } from 'vue';
import { useAudio } from './useAudio';

export interface TunerResult {
  frequency: number;
  noteName: string;
  noteIndex: number;
  cents: number;
  clarity: number; // 0 to 1 confidence
}

// French and English note name lists
const NOTES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const NOTES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function useTuner() {
  const { initAudio } = useAudio();

  const isActive = ref(false);
  const currentPitch = ref<number | null>(null);
  const currentNote = ref<string>('');
  const currentCents = ref<number>(0);
  const confidence = ref<number>(0);

  let audioStream: MediaStream | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let animationFrameId: number | null = null;
  let audioBuffer: Float32Array | null = null;

  // Autocorrelation Pitch Detection Algorithm
  // Explication: L'autocorrélation compare un signal audio avec lui-même décalé dans le temps (lag).
  // Si le signal est périodique (une note musicale propre), le produit du signal et de sa version
  // décalée sera maximal lorsque le décalage correspond exactement à la période de l'onde sonore.
  const detectPitch = (buffer: Float32Array, sampleRate: number): TunerResult | null => {
    const bufferSize = buffer.length;
    
    // 1. Calculer l'amplitude moyenne (Root Mean Square - RMS) pour détecter le silence.
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / bufferSize);
    
    // Si le signal est trop faible (bruit de fond / silence), on s'arrête (seuil à 0.01)
    if (rms < 0.01) {
      return null;
    }

    // 2. Découpage du signal pour éliminer le bruit de décalage initial (seuil d'autocorrélation)
    let r1 = 0;
    let r2 = bufferSize - 1;
    const thres = 0.2; // Seuil d'écrêtage
    for (let i = 0; i < bufferSize / 2; i++) {
      if (Math.abs(buffer[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = bufferSize - 1; i >= bufferSize / 2; i--) {
      if (Math.abs(buffer[i]) < thres) {
        r2 = i;
        break;
      }
    }
    
    const clippedBuffer = buffer.subarray(r1, r2);
    const clippedSize = clippedBuffer.length;

    // 3. Calcul de la fonction d'autocorrélation pour chaque décalage (lag)
    const correlation = new Float32Array(clippedSize);
    for (let lag = 0; lag < clippedSize; lag++) {
      let sum = 0;
      for (let i = 0; i < clippedSize - lag; i++) {
        sum += clippedBuffer[i] * clippedBuffer[i + lag];
      }
      correlation[lag] = sum;
    }

    // 4. Recherche du premier sommet après le déclin initial à lag = 0.
    // Le décalage à lag = 0 a la corrélation maximale (le signal comparé à lui-même sans décalage).
    // On doit avancer jusqu'à ce que la corrélation commence à remonter pour trouver le premier pic périodique.
    let d = 0;
    while (d < correlation.length - 1 && correlation[d] > correlation[d + 1]) {
      d++;
    }

    // Recherche du maximum local après ce point
    let maxVal = -1;
    let maxLag = -1;
    for (let i = d; i < correlation.length; i++) {
      if (correlation[i] > maxVal) {
        maxVal = correlation[i];
        maxLag = i;
      }
    }

    // Si on a un pic de corrélation valide
    if (maxLag > -1 && correlation[maxLag] > 0.01) {
      // Fréquence fondamentale = Taux d'échantillonnage / décalage optimal (période)
      const frequency = sampleRate / maxLag;
      
      // Limites réalistes pour la voix et la guitare (entre 50 Hz et 1500 Hz)
      if (frequency > 50 && frequency < 1500) {
        // 5. Conversion de la fréquence (Hz) en note de musique (demi-tons par rapport à La 440 Hz)
        // La formule mathématique est : 12 * log2(F / 440) + 69 (pour l'index MIDI)
        const midiNote = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
        const noteIndex = Math.round(midiNote);
        
        // Calcul du décalage d'accordage en cents (centième de demi-ton)
        const cents = (midiNote - noteIndex) * 100;
        
        // Calcul du degré de confiance (pureté du pic)
        const clarity = correlation[maxLag] / correlation[0];

        return {
          frequency,
          noteIndex,
          noteName: '', // Rempli plus tard selon la langue
          cents,
          clarity
        };
      }
    }
    
    return null;
  };

  const updateTuner = (sampleRate: number, isEnglish: boolean) => {
    if (!analyserNode || !audioBuffer) return;

    // Récupérer le signal temporel actuel dans le buffer
    analyserNode.getFloatTimeDomainData(audioBuffer as any);

    // Détecter la fréquence fondamentale
    const result = detectPitch(audioBuffer, sampleRate);

    if (result && result.clarity > 0.85) {
      currentPitch.value = Math.round(result.frequency * 10) / 10;
      
      // Assigner le nom de la note selon l'index MIDI et la langue choisie
      const noteNameList = isEnglish ? NOTES_EN : NOTES_FR;
      const normalizedIndex = result.noteIndex % 12;
      
      // Les octaves peuvent également être calculées : Math.floor(result.noteIndex / 12) - 1
      const octave = Math.floor(result.noteIndex / 12) - 1;
      
      currentNote.value = noteNameList[normalizedIndex] + octave;
      currentCents.value = Math.round(result.cents);
      confidence.value = result.clarity;
    } else {
      // Conserver la dernière note mais réduire doucement la confiance ou lisser pour éviter les tremblements
      confidence.value = Math.max(0, confidence.value - 0.1);
      if (confidence.value === 0) {
        currentPitch.value = null;
      }
    }

    if (isActive.value) {
      animationFrameId = requestAnimationFrame(() => updateTuner(sampleRate, isEnglish));
    }
  };

  const start = async (languageSetting: 'fr-FR' | 'en-US' = 'fr-FR') => {
    const audioCtx = await initAudio();
    if (!audioCtx) return;

    if (isActive.value) return;

    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });

      sourceNode = audioCtx.createMediaStreamSource(audioStream);
      analyserNode = audioCtx.createAnalyser();
      
      // Taille du tampon de 2048 pour équilibrer latence temporelle et précision fréquentielle
      analyserNode.fftSize = 2048; 
      audioBuffer = new Float32Array(analyserNode.fftSize);
      
      sourceNode.connect(analyserNode);
      isActive.value = true;

      const isEnglish = languageSetting === 'en-US';
      updateTuner(audioCtx.sampleRate, isEnglish);
    } catch (e) {
      console.error('Failed to access microphone for Tuner/Pitch Tracker', e);
      throw e;
    }
  };

  const stop = () => {
    isActive.value = false;
    currentPitch.value = null;
    currentNote.value = '';
    currentCents.value = 0;
    confidence.value = 0;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    analyserNode = null;
    audioBuffer = null;
  };

  return {
    isActive: readonly(isActive),
    currentPitch: readonly(currentPitch),
    currentNote: readonly(currentNote),
    currentCents: readonly(currentCents),
    confidence: readonly(confidence),
    start,
    stop
  };
}
