import { ref, readonly } from 'vue';

const audioContext = ref<AudioContext | null>(null);
const isUnlocked = ref(false);

export function useAudio() {
  const initAudio = async () => {
    const unlock = async () => {
      if (audioContext.value && (audioContext.value.state as string) === 'suspended') {
        try {
          await audioContext.value.resume();
        } catch (e) {
          console.error('Failed to resume AudioContext on gesture', e);
        }
      }
      if (audioContext.value && (audioContext.value.state as string) === 'running') {
        isUnlocked.value = true;
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
      }
    };

    if (audioContext.value) {
      if ((audioContext.value.state as string) === 'suspended') {
        try {
          await audioContext.value.resume();
          if ((audioContext.value.state as string) === 'running') {
            isUnlocked.value = true;
          } else {
            window.addEventListener('click', unlock);
            window.addEventListener('touchstart', unlock);
          }
        } catch (e) {
          console.error('Failed to resume AudioContext', e);
          window.addEventListener('click', unlock);
          window.addEventListener('touchstart', unlock);
        }
      } else if ((audioContext.value.state as string) === 'running') {
        isUnlocked.value = true;
      }
      return audioContext.value;
    }

    try {
      // Create the AudioContext
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioContext.value = ctx;

      if ((ctx.state as string) === 'running') {
        isUnlocked.value = true;
      } else {
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
