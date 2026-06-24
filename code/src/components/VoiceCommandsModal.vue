<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="close"></div>
    <div class="relative bg-[#1A1A24] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
      <div class="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
        <h2 class="text-xl font-bold text-white">Commandes Vocales ({{ locale }})</h2>
        <button @click="close" class="text-gray-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="p-6 overflow-y-auto max-h-[70vh] flex flex-col gap-4">
        <div v-for="cmd in commands" :key="cmd.action" class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4">
          <div>
            <h3 class="font-bold text-neon-pink mb-1">{{ cmd.action }}</h3>
            <div class="flex flex-wrap gap-2">
              <span v-for="kw in cmd.keywords" :key="kw" class="text-xs bg-black/50 text-gray-300 px-2 py-1 rounded-md border border-white/5">"{{ kw }}"</span>
            </div>
            <p v-if="cmd.action === 'metronome-start'" class="text-xs text-gray-500 mt-2">
              Exemple: "métronome 120"
            </p>
          </div>
          <button @click="executeCommand(cmd.action)" class="shrink-0 ml-4 p-2 bg-neon-purple/20 hover:bg-neon-purple text-neon-purple hover:text-white border border-neon-purple/50 rounded-xl transition-colors shadow-sm" title="Exécuter l'action">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { COMMAND_DICTIONARY } from '../composables/useSpeech';

const props = defineProps<{
  isOpen: boolean;
  locale: 'fr-FR' | 'en-US';
}>();

const emit = defineEmits(['close', 'execute']);

const commands = computed(() => {
  return COMMAND_DICTIONARY[props.locale] || [];
});

const close = () => {
  emit('close');
};

const executeCommand = (action: string) => {
  if (action === 'metronome-start') {
    emit('execute', 'metronome-start-bpm', 120);
  } else {
    emit('execute', action);
  }
};
</script>
