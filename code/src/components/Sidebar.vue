<template>
  <div class="h-full flex flex-col bg-bg-dark border-r border-white/10 w-80 shrink-0">
    <!-- Header -->
    <div class="p-6 border-b border-white/10 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-neon-pink flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neon-purple"><path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98L16 12"/><circle cx="17" cy="7" r="5"/></svg>
        Rockstar
      </h1>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex p-2 gap-1 border-b border-white/10 bg-white/5">
      <button 
        @click="activeTab = 'songs'" 
        class="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
        :class="activeTab === 'songs' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'"
      >
        Morceaux
      </button>
      <button 
        @click="activeTab = 'setlists'" 
        class="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
        :class="activeTab === 'setlists' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'"
      >
        Setlists
      </button>
    </div>

    <!-- Tab Content: Songs -->
    <div v-if="activeTab === 'songs'" class="flex-1 overflow-y-auto flex flex-col">
      <div class="p-4 border-b border-white/10">
        <button 
          @click="openAddModal"
          class="w-full py-2.5 flex items-center justify-center gap-2 bg-neon-purple/20 hover:bg-neon-purple/30 text-neon-purple border border-neon-purple/50 rounded-xl font-semibold transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Nouveau Morceau
        </button>
      </div>
      
      <!-- Song List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
        <div v-if="songs.length === 0" class="text-center text-gray-500 py-8 text-sm">
          Aucun morceau.
        </div>
        <button 
          v-for="song in songs" 
          :key="song.id"
          @click="selectSong(song.id)"
          class="w-full text-left p-3 rounded-xl transition-all border border-transparent group relative"
          :class="currentSongId === song.id ? 'bg-white/10 border-white/10' : 'hover:bg-white/5'"
        >
          <div class="font-semibold text-white truncate pr-8">{{ song.title }}</div>
          <div class="text-xs text-gray-400 truncate">{{ song.artist }}</div>
          
          <div v-if="currentSongId === song.id" class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button @click.stop="openEditModal(song)" class="text-gray-400 hover:text-neon-pink p-1 rounded-md transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
          </div>
        </button>
      </div>
    </div>

    <!-- Tab Content: Setlists -->
    <div v-if="activeTab === 'setlists'" class="flex-1 overflow-y-auto flex flex-col">
      <div class="p-4 border-b border-white/10">
        <button 
          @click="createNewSetlist"
          class="w-full py-2.5 flex items-center justify-center gap-2 bg-neon-pink/20 hover:bg-neon-pink/30 text-neon-pink border border-neon-pink/50 rounded-xl font-semibold transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Nouvelle Setlist
        </button>
      </div>
      
      <!-- Setlist List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
        <div v-if="setlists.length === 0" class="text-center text-gray-500 py-8 text-sm">
          Aucune setlist.
        </div>
        <button 
          v-for="setlist in setlists" 
          :key="setlist.id"
          @click="selectSetlist(setlist.id)"
          class="w-full text-left p-3 rounded-xl transition-all border border-transparent"
          :class="currentSetlistId === setlist.id ? 'bg-white/10 border-white/10' : 'hover:bg-white/5'"
        >
          <div class="font-semibold text-white truncate">{{ setlist.name }}</div>
          <div class="text-xs text-gray-400 truncate">{{ setlist.songIds.length }} morceaux</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { repertoireStore } from '../store/repertoire';
import type { Song } from '../services/db';

const activeTab = ref<'songs' | 'setlists'>('songs');

const songs = repertoireStore.songs;
const setlists = repertoireStore.setlists;
const currentSongId = computed(() => repertoireStore.state.value.currentSongId);
const currentSetlistId = computed(() => repertoireStore.state.value.currentSetlistId);

const emit = defineEmits(['openAddModal', 'openEditModal']);

const openAddModal = () => {
  emit('openAddModal');
};

const openEditModal = (song: Song) => {
  emit('openEditModal', song);
};

const selectSong = (id: string) => {
  repertoireStore.selectSong(id);
};

const selectSetlist = (id: string) => {
  repertoireStore.selectSetlist(id);
};

const createNewSetlist = async () => {
  const name = prompt('Nom de la nouvelle setlist :');
  if (name) {
    await repertoireStore.addSetlist(name);
  }
};
</script>
