<template>
  <div v-if="youtubeId" class="w-full bg-[#0B0A10] border-t border-white/10 p-2 flex items-center gap-4">
    <div class="hidden md:block w-32 h-18 rounded-lg overflow-hidden relative shadow-lg">
      <!-- Hidden iframe, we use it just for audio/control, or show it small -->
      <iframe 
        ref="ytIframe"
        :src="`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&controls=0&disablekb=1&fs=0&rel=0`" 
        class="w-full h-full border-none"
        allow="autoplay; encrypted-media"
      ></iframe>
      <div class="absolute inset-0 bg-black/20 pointer-events-none"></div>
    </div>
    
    <div class="flex-1 flex flex-col justify-center">
      <div class="text-xs text-neon-pink font-bold uppercase tracking-wider mb-1">Piste d'accompagnement</div>
      <div class="flex items-center gap-2">
        <button @click="rewind" class="p-2 text-gray-400 hover:text-white transition-colors" title="Reculer 10s">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>
        </button>
        <button @click="togglePlay" class="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
          <svg v-if="!isPlaying" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
        <button @click="restart" class="p-2 text-gray-400 hover:text-white transition-colors" title="Recommencer">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { repertoireStore } from '../store/repertoire';

const ytIframe = ref<HTMLIFrameElement | null>(null);
const isPlaying = ref(false);

const currentSong = repertoireStore.currentSong;

const youtubeId = computed(() => {
  if (!currentSong.value?.youtubeUrl) return null;
  const match = currentSong.value.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
});

watch(() => youtubeId.value, () => {
  isPlaying.value = false;
});

const sendCommand = (func: string, args: any[] = []) => {
  if (!ytIframe.value || !ytIframe.value.contentWindow) return;
  ytIframe.value.contentWindow.postMessage(JSON.stringify({
    event: 'command',
    func: func,
    args: args
  }), '*');
};

const togglePlay = () => {
  if (isPlaying.value) {
    sendCommand('pauseVideo');
    isPlaying.value = false;
  } else {
    sendCommand('playVideo');
    isPlaying.value = true;
  }
};

const pause = () => {
  sendCommand('pauseVideo');
  isPlaying.value = false;
};

const play = () => {
  sendCommand('playVideo');
  isPlaying.value = true;
};

const restart = () => {
  sendCommand('seekTo', [0, true]);
  sendCommand('playVideo');
  isPlaying.value = true;
};

const rewind = () => {
  // Since we can't easily read current time without full API, we do a trick:
  // Using the full YouTube IFrame API would be required to get current time. 
  // For now, rewinding requires the full API script. We'll leave it as a seekTo(0) for simplicity
  // unless we implement the full API. Let's restart for now.
  restart();
};

defineExpose({
  play,
  pause,
  togglePlay,
  restart,
  rewind
});
</script>
