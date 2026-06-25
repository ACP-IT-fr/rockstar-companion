<template>
  <div class="flex-1 flex flex-col relative bg-[#1E1E24] overflow-hidden" ref="viewerContainer">
    <div v-if="!currentSong" class="flex-1 flex items-center justify-center text-gray-500 flex-col gap-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="opacity-50"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      <p>Sélectionnez un morceau pour commencer.</p>
    </div>
    
    <div v-else class="flex-1 w-full h-full relative">
      <!-- Loading State -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-[#1E1E24] z-10">
        <div class="w-10 h-10 border-4 border-neon-purple border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- PDF Viewer -->
      <iframe 
        ref="pdfFrame"
        v-if="currentSong.sourceType === 'pdf' && pdfUrl" 
        :src="pdfUrl" 
        class="w-full h-full border-none bg-white"
        title="Partition PDF"
        @load="onFrameLoad"
      ></iframe>

      <!-- Web Viewer -->
      <div v-else-if="currentSong.sourceType === 'url'" class="w-full h-full flex flex-col relative">
        <div v-if="isUltimateGuitar(currentSong.url)" class="flex-1 flex items-center justify-center bg-[#1E1E24] flex-col gap-6 p-8 text-center h-full">
          <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-neon-pink opacity-80"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <div>
            <h3 class="text-2xl font-bold text-white mb-2">Protection Ultimate Guitar</h3>
            <p class="text-gray-400 max-w-md mx-auto">Ultimate Guitar bloque l'affichage de ses partitions à l'intérieur d'autres applications. Vous devez l'ouvrir dans un nouvel onglet.</p>
          </div>
          <a :href="currentSong.url" target="_blank" rel="noopener noreferrer" class="px-8 py-4 bg-neon-purple text-white rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(188,19,254,0.4)] hover:shadow-[0_0_30px_rgba(188,19,254,0.6)] hover:bg-purple-500 transition-all flex items-center gap-3 mt-4">
            <span>Ouvrir la partition</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
        <template v-else>
          <iframe 
            ref="webFrame"
            :src="currentSong.url" 
            class="w-full h-full border-none bg-white"
            title="Partition Web"
            allow="compute-pressure"
            @load="onFrameLoad"
            @error="onFrameError"
          ></iframe>
          <!-- Fallback overlay for URL if it doesn't load well or as a handy link -->
          <div class="absolute top-4 right-4 z-20">
            <a :href="currentSong.url" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-md border border-white/20 text-white rounded-xl shadow-lg hover:bg-black/80 transition-all text-sm font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Ouvrir dans un nouvel onglet
            </a>
          </div>
        </template>
      </div>
    </div>
    
    <!-- Song Info Overlay (Stage Mode Overlay) -->
    <div v-if="currentSong" class="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none flex justify-between items-start z-20">
      <div>
        <h2 class="text-2xl font-bold text-white drop-shadow-md">{{ currentSong.title }}</h2>
        <p class="text-neon-pink font-semibold drop-shadow-md">{{ currentSong.artist }}</p>
      </div>
      <div class="flex gap-3">
        <div v-if="currentSong.capo > 0" class="px-3 py-1 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg text-white font-mono text-sm shadow-md">
          Capo: {{ currentSong.capo }}
        </div>
        <div v-if="currentSong.transpose !== 0" class="px-3 py-1 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg text-white font-mono text-sm shadow-md">
          Trans: {{ currentSong.transpose > 0 ? '+' : '' }}{{ currentSong.transpose }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { repertoireStore } from '../store/repertoire';

const currentSong = repertoireStore.currentSong;
const pdfUrl = ref<string | null>(null);
const isLoading = ref(false);
const webFrame = ref<HTMLIFrameElement | null>(null);
const pdfFrame = ref<HTMLIFrameElement | null>(null);

const isUltimateGuitar = (url?: string) => {
  if (!url) return false;
  return url.toLowerCase().includes('ultimate-guitar.com');
};

const getActiveFrame = () => {
  if (currentSong.value?.sourceType === 'pdf') return pdfFrame.value;
  return webFrame.value;
};

// Expose scroll methods for Voice Commands
const scrollDown = (offset: number = 300) => {
  // Try to scroll iframe window if possible (CORS will block if cross-origin URL)
  // For local PDF it works because blob URL is same-origin
  try {
    const frame = getActiveFrame();
    if (frame && frame.contentWindow) {
      frame.contentWindow.scrollBy({ top: offset, behavior: 'smooth' });
    }
  } catch (e) {
    console.warn('Cannot scroll iframe due to cross-origin policies.', e);
  }
};

const scrollUp = (offset: number = 300) => {
  try {
    const frame = getActiveFrame();
    if (frame && frame.contentWindow) {
      frame.contentWindow.scrollBy({ top: -offset, behavior: 'smooth' });
    }
  } catch (e) {
    console.warn('Cannot scroll iframe due to cross-origin policies.', e);
  }
};

const scrollTop = () => {
  try {
    const frame = getActiveFrame();
    if (frame && frame.contentWindow) {
      frame.contentWindow.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (e) {
    console.warn('Cannot scroll iframe due to cross-origin policies.', e);
  }
};

defineExpose({
  scrollDown,
  scrollUp,
  scrollTop
});

watch(() => currentSong.value, (song) => {
  // Clean up previous blob URL
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value);
    pdfUrl.value = null;
  }
  
  if (song) {
    if (song.sourceType === 'url' && isUltimateGuitar(song.url)) {
      isLoading.value = false;
    } else {
      isLoading.value = true;
    }
    
    if (song.sourceType === 'pdf' && song.pdfBlob) {
      pdfUrl.value = URL.createObjectURL(song.pdfBlob) + '#toolbar=0&navpanes=0&scrollbar=0';
    }
  }
}, { immediate: true });

const onFrameLoad = () => {
  isLoading.value = false;
};

const onFrameError = () => {
  isLoading.value = false;
  console.error("Erreur de chargement de l'iframe");
};

onBeforeUnmount(() => {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value);
  }
});
</script>

<style scoped>
/* Scoped styles */
</style>
