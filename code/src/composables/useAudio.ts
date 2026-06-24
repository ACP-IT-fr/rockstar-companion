import { ref, readonly } from 'vue';

const audioContext = ref<AudioContext | null>(null);
const isUnlocked = ref(false);

export function useAudio() {
  const initAudio = async () => {
    if (audioContext.value) {
      if (audioContext.value.state === 'suspended') {
        try {
          await audioContext.value.resume();
          isUnlocked.value = true;
        } catch (e) {
          console.error('Failed to resume AudioContext', e);
        }
      }
      return audioContext.value;
    }

    try {
      // Create the AudioContext
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioContext.value = ctx;

      if (ctx.state === 'running') {
        isUnlocked.value = true;
      } else {
        // Suspended state (typical on iOS/Chrome until user gesture)
        const unlock = async () => {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          isUnlocked.value = true;
          // Remove listener once unlocked
          window.removeEventListener('click', unlock);
          window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
      }
    } catch (e) {
      console.error('Web Audio API is not supported in this browser', e);
    }

    return audioContext.value;
  };

  return {
    audioContext: readonly(audioContext),
    isUnlocked: readonly(isUnlocked),
    initAudio
  };
}
