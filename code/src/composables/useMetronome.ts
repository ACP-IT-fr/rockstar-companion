import { ref } from 'vue';
import { useAudio } from './useAudio';

export function useMetronome() {
  const { initAudio } = useAudio();
  
  const bpm = ref(120);
  const isPlaying = ref(false);
  const currentBeat = ref(0); // 0, 1, 2, 3 for 4/4 time
  const beatsPerMeasure = ref(4);

  let timerId: number | null = null;
  let nextNoteTime = 0.0;       // When the next note is due (in AudioContext time)
  const lookahead = 25.0;       // How frequently to call scheduler (in ms)
  const scheduleAheadTime = 0.1; // How far ahead to schedule audio (in seconds)
  
  let current16thNote = 0;      // What note is currently playing

  // Web Audio oscillator nodes for beeps
  const playTone = (audioCtx: AudioContext, time: number, isFirstBeat: boolean) => {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Beat 1 gets a higher pitch
    osc.frequency.value = isFirstBeat ? 1000 : 600;
    
    // Very quick click
    gainNode.gain.setValueAtTime(0.3, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    
    osc.start(time);
    osc.stop(time + 0.1);
  };

  const scheduleNote = (beatNumber: number, time: number, audioCtx: AudioContext) => {
    // Schedule the audio beep
    const isFirstBeat = beatNumber % beatsPerMeasure.value === 0;
    playTone(audioCtx, time, isFirstBeat);
    
    // Schedule visual beat update in sync with audio
    const delay = (time - audioCtx.currentTime) * 1000;
    setTimeout(() => {
      if (isPlaying.value) {
        currentBeat.value = beatNumber % beatsPerMeasure.value;
      }
    }, Math.max(0, delay));
  };

  const scheduler = (audioCtx: AudioContext) => {
    // While there are notes to play before the next interval
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
      scheduleNote(current16thNote, nextNoteTime, audioCtx);
      
      // Advance next note by duration of a quarter note (60 / BPM)
      const secondsPerBeat = 60.0 / bpm.value;
      nextNoteTime += secondsPerBeat;
      
      current16thNote++;
    }
  };

  const start = async () => {
    const audioCtx = await initAudio();
    if (!audioCtx) return;

    if (isPlaying.value) return;

    isPlaying.value = true;
    current16thNote = 0;
    currentBeat.value = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;

    const run = () => {
      if (!isPlaying.value) return;
      scheduler(audioCtx);
      timerId = window.setTimeout(run, lookahead);
    };

    run();
  };

  const stop = () => {
    if (!isPlaying.value) return;
    isPlaying.value = false;
    currentBeat.value = 0;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const toggle = () => {
    if (isPlaying.value) {
      stop();
    } else {
      start();
    }
  };

  return {
    bpm,
    isPlaying,
    currentBeat,
    beatsPerMeasure,
    start,
    stop,
    toggle
  };
}
