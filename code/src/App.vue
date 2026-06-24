<template>
  <div class="h-screen w-full bg-bg-dark text-white flex flex-col overflow-hidden font-sans selection:bg-neon-pink/30">
    <!-- Top Bar (Minimalist) -->
    <header class="h-14 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-black/40 backdrop-blur-md z-10">
      <div class="flex items-center gap-4">
        <!-- Voice Command Status -->
        <div class="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold transition-all shadow-sm"
             :class="isListening ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/30 shadow-[0_0_10px_rgba(236,72,153,0.3)]' : 'bg-white/5 text-gray-500 border border-white/10'">
          <svg v-if="isListening" class="animate-pulse" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          {{ isListening ? 'Écoute active' : 'Microphone inactif' }}
        </div>
        <div v-if="lastRecognizedText" class="text-xs text-gray-400 font-mono flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
          "{{ lastRecognizedText }}"
        </div>
      </div>
      
      <div class="flex items-center gap-4">
        <!-- Language Switcher -->
        <button @click="toggleLanguage" class="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold border border-white/10 transition-colors uppercase">
          {{ currentLang.substring(0, 2) }}
        </button>
      </div>
    </header>

    <!-- Main Workspace -->
    <main class="flex-1 flex overflow-hidden">
      <!-- Sidebar -->
      <Sidebar 
        @openAddModal="isAddModalOpen = true"
        @openEditModal="openEdit"
      />
      
      <!-- Central View (Score/PDF) -->
      <SongViewer ref="songViewer" />
      
      <!-- Right Panel (Metronome & Tuner) -->
      <MetronomeTuner ref="metronomeTuner" />
    </main>

    <!-- Bottom Player -->
    <AudioPlayer ref="audioPlayer" />

    <!-- Modals -->
    <AddSongModal 
      :isOpen="isAddModalOpen" 
      :editSong="songToEdit"
      @close="closeModal" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Sidebar from './components/Sidebar.vue';
import SongViewer from './components/SongViewer.vue';
import MetronomeTuner from './components/MetronomeTuner.vue';
import AudioPlayer from './components/AudioPlayer.vue';
import AddSongModal from './components/AddSongModal.vue';
import { useSpeech } from './composables/useSpeech';
import { repertoireStore } from './store/repertoire';
import type { Song } from './services/db';

const isAddModalOpen = ref(false);
const songToEdit = ref<Song | null>(null);

const songViewer = ref<InstanceType<typeof SongViewer> | null>(null);
const metronomeTuner = ref<InstanceType<typeof MetronomeTuner> | null>(null);
const audioPlayer = ref<InstanceType<typeof AudioPlayer> | null>(null);

const { startListening, stopListening, isListening, lastRecognizedText } = useSpeech();
const currentLang = ref(repertoireStore.state.value.settings.voiceCommandLanguage);

const handleCommand = (action: string, value?: any) => {
  console.log('Command received in App:', action, value);
  switch (action) {
    case 'next':
      repertoireStore.nextSong();
      break;
    case 'prev':
      repertoireStore.prevSong();
      break;
    case 'scroll-down':
      songViewer.value?.scrollDown();
      break;
    case 'scroll-up':
      songViewer.value?.scrollUp();
      break;
    case 'scroll-top':
      songViewer.value?.scrollTop();
      break;
    case 'play':
      audioPlayer.value?.play();
      break;
    case 'pause':
      audioPlayer.value?.pause();
      break;
    case 'restart':
      audioPlayer.value?.restart();
      break;
    case 'rewind':
      audioPlayer.value?.rewind();
      break;
    case 'metronome-start':
    case 'metronome-start-bpm':
      metronomeTuner.value?.voiceStartMetronome(value);
      break;
    case 'metronome-stop':
      metronomeTuner.value?.voiceStopMetronome();
      break;
    case 'tuner-toggle':
      metronomeTuner.value?.voiceToggleTuner();
      break;
  }
};

const toggleLanguage = () => {
  const newLang = currentLang.value.startsWith('fr') ? 'en-US' : 'fr-FR';
  repertoireStore.updateSettings({ voiceCommandLanguage: newLang });
  currentLang.value = newLang;
  // Restart listening with new language
  stopListening();
  setTimeout(() => startListening(newLang, handleCommand), 100);
};

const openEdit = (song: Song) => {
  songToEdit.value = song;
  isAddModalOpen.value = true;
};

const closeModal = () => {
  isAddModalOpen.value = false;
  songToEdit.value = null;
};

onMounted(async () => {
  await repertoireStore.init();
  startListening(currentLang.value, handleCommand);
});

onBeforeUnmount(() => {
  stopListening();
});
</script>
