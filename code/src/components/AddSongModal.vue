<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="close"></div>
    
    <!-- Modal -->
    <div class="relative bg-[#1A1A24] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
      <div class="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
        <h2 class="text-xl font-bold text-white">{{ isEditing ? 'Modifier le Morceau' : 'Nouveau Morceau' }}</h2>
        <button @click="close" class="text-gray-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      
      <div class="p-6 overflow-y-auto flex flex-col gap-4 max-h-[70vh]">
        
        <div>
          <label class="block text-sm font-semibold text-gray-300 mb-1">Titre <span class="text-neon-pink">*</span></label>
          <input v-model="formData.title" type="text" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-neon-purple transition-colors" placeholder="Ex: Master of Puppets" required>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-300 mb-1">Artiste <span class="text-neon-pink">*</span></label>
          <input v-model="formData.artist" type="text" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-neon-purple transition-colors" placeholder="Ex: Metallica" required>
        </div>
        
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-semibold text-gray-300 mb-1">Capo</label>
            <input v-model.number="formData.capo" type="number" min="0" max="12" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-neon-purple transition-colors">
          </div>
          <div class="flex-1">
            <label class="block text-sm font-semibold text-gray-300 mb-1">Transposition</label>
            <input v-model.number="formData.transpose" type="number" min="-12" max="12" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-neon-purple transition-colors">
          </div>
        </div>
        
        <div class="border-t border-white/10 pt-4 mt-2">
          <label class="block text-sm font-semibold text-gray-300 mb-2">Source de la partition</label>
          <div class="flex gap-2 mb-4">
            <button @click="sourceType = 'url'" class="flex-1 py-2 text-sm font-semibold rounded-lg transition-all border" :class="sourceType === 'url' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-gray-500 hover:bg-white/5'">URL Web</button>
            <button @click="sourceType = 'pdf'" class="flex-1 py-2 text-sm font-semibold rounded-lg transition-all border" :class="sourceType === 'pdf' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-gray-500 hover:bg-white/5'">Fichier PDF</button>
          </div>
          
          <div v-if="sourceType === 'url'">
            <input v-model="formData.url" type="url" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-neon-purple transition-colors" placeholder="https://tabs.ultimate-guitar.com/...">
          </div>
          <div v-else>
            <input type="file" accept="application/pdf" @change="handleFileUpload" class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-all cursor-pointer">
            <p v-if="formData.pdfBlob" class="mt-2 text-xs text-neon-cyan font-semibold flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> PDF chargé
            </p>
          </div>
        </div>

        <div class="border-t border-white/10 pt-4 mt-2">
          <label class="block text-sm font-semibold text-gray-300 mb-1">Lien YouTube (Backing Track) <span class="text-xs text-gray-500 font-normal">Optionnel</span></label>
          <input v-model="formData.youtubeUrl" type="url" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-neon-purple transition-colors" placeholder="https://youtube.com/watch?v=...">
        </div>
      </div>
      
      <div class="p-6 border-t border-white/10 flex justify-end gap-3 bg-black/20">
        <button @click="close" class="px-5 py-2.5 rounded-xl font-semibold text-gray-300 hover:bg-white/10 transition-colors">Annuler</button>
        <button @click="save" :disabled="!isValid" class="px-5 py-2.5 rounded-xl font-semibold bg-neon-purple hover:bg-purple-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Enregistrer</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { repertoireStore } from '../store/repertoire';
import type { Song } from '../services/db';

const props = defineProps<{
  isOpen: boolean,
  editSong?: Song | null
}>();

const emit = defineEmits(['close']);

const isEditing = computed(() => !!props.editSong);
const sourceType = ref<'url' | 'pdf'>('url');

const formData = ref<Partial<Song>>({
  title: '',
  artist: '',
  capo: 0,
  transpose: 0,
  sourceType: 'url',
  url: '',
  youtubeUrl: '',
  pdfBlob: undefined
});

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    if (props.editSong) {
      formData.value = { ...props.editSong };
      sourceType.value = props.editSong.sourceType;
    } else {
      formData.value = {
        title: '',
        artist: '',
        capo: 0,
        transpose: 0,
        sourceType: 'url',
        url: '',
        youtubeUrl: '',
        pdfBlob: undefined
      };
      sourceType.value = 'url';
    }
  }
});

const isValid = computed(() => {
  return formData.value.title && formData.value.artist && 
    (sourceType.value === 'url' ? formData.value.url : formData.value.pdfBlob);
});

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    formData.value.pdfBlob = target.files[0];
  }
};

const save = async () => {
  if (!isValid.value) return;
  
  formData.value.sourceType = sourceType.value;
  
  if (isEditing.value && props.editSong) {
    await repertoireStore.updateSong(props.editSong.id, formData.value);
  } else {
    // Add default cover as a placeholder if needed, DB doesn't require it strictly
    await repertoireStore.addSong(formData.value as Omit<Song, 'id'>);
  }
  close();
};

const close = () => {
  emit('close');
};
</script>
