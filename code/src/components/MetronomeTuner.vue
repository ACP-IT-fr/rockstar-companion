<template>
  <div class="w-80 shrink-0 bg-[#0B0A10] border-l border-white/10 flex flex-col h-full overflow-y-auto no-scrollbar">
    
    <!-- Metronome Section -->
    <div class="p-6 border-b border-white/10 relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-neon-purple/5 to-transparent pointer-events-none"></div>
      
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neon-purple"><path d="m15.5 15.5 4.5-4.5"/><path d="M4 10h4l-4 8h4"/><path d="M12 2v20"/></svg>
          Métronome
        </h2>
        <button @click="toggleMetronome" class="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg" :class="isMetronomePlaying ? 'bg-neon-pink text-white shadow-neon-pink/30' : 'bg-white/10 text-white hover:bg-white/20'">
          <svg v-if="!isMetronomePlaying" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
      </div>

      <div class="flex items-center justify-center gap-4 mb-6">
        <button @click="bpm = Math.max(40, bpm - 1)" class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">-</button>
        <div class="text-center">
          <div class="text-4xl font-mono font-bold text-white tracking-tighter">{{ bpm }}</div>
          <div class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">BPM</div>
        </div>
        <button @click="bpm = Math.min(240, bpm + 1)" class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">+</button>
      </div>

      <!-- Beat Indicator -->
      <div class="flex justify-between px-4">
        <div v-for="i in 4" :key="i" class="w-10 h-2 rounded-full transition-all duration-75" :class="[
          isMetronomePlaying && currentBeat === (i - 1) 
            ? (i === 1 ? 'bg-neon-pink shadow-[0_0_10px_rgba(236,72,153,0.8)]' : 'bg-neon-purple shadow-[0_0_10px_rgba(139,92,246,0.8)]') 
            : 'bg-white/10'
        ]"></div>
      </div>
    </div>

    <!-- Tuner & Pitch Tracker Section -->
    <div class="p-6 flex-1 flex flex-col relative">
      <div class="absolute inset-0 bg-gradient-to-tr from-neon-cyan/5 to-transparent pointer-events-none"></div>

      <div class="flex items-center justify-between mb-8">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neon-cyan"><path d="M12 2v20"/><path d="m5 9 7-7 7 7"/></svg>
          Accordeur
        </h2>
        
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" v-model="isTunerActive" class="sr-only peer">
          <div class="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon-cyan"></div>
        </label>
      </div>

      <!-- Tuner Display -->
      <div v-if="isTunerActive" class="flex flex-col items-center flex-1 justify-center relative">
        <!-- Note Display -->
        <div class="text-[80px] leading-none font-bold font-mono tracking-tighter mb-2 transition-all duration-100"
             :class="isTuned ? 'text-neon-cyan drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'text-white'">
          {{ tunerNote || '--' }}
        </div>
        <div class="text-sm font-mono text-gray-400 mb-8">{{ tunerPitch ? tunerPitch + ' Hz' : 'En attente...' }}</div>

        <!-- Cents Gauge -->
        <div class="w-full relative h-12 flex items-center">
          <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden relative">
            <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white z-10"></div>
          </div>
          
          <!-- Needle -->
          <div v-if="tunerNote" class="absolute h-8 w-1 top-2 bg-white rounded-full transition-all duration-75 shadow-[0_0_8px_white]"
               :class="isTuned ? 'bg-neon-cyan shadow-[0_0_10px_rgba(6,182,212,1)]' : 'bg-neon-pink shadow-[0_0_10px_rgba(236,72,153,1)]'"
               :style="{ left: `calc(50% + ${Math.max(-45, Math.min(45, tunerCents))}%)`, transform: 'translateX(-50%)' }">
          </div>
        </div>
        
        <div class="w-full flex justify-between text-[10px] font-bold text-gray-500 uppercase mt-2">
          <span>Trop grave</span>
          <span :class="isTuned ? 'text-neon-cyan' : ''">Juste</span>
          <span>Trop aigu</span>
        </div>
      </div>
      
      <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm text-center px-4">
        Activez l'accordeur pour détecter les fréquences via le microphone.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { useMetronome } from '../composables/useMetronome';
import { useTuner } from '../composables/useTuner';
import { repertoireStore } from '../store/repertoire';

// Metronome Logic
const { bpm, isPlaying: isMetronomePlaying, currentBeat, toggle: toggleMetronome, start: startMetronome, stop: stopMetronome } = useMetronome();

// Initialize BPM from settings
watch(() => repertoireStore.state.value.settings.metronomeBpm, (newVal) => {
  if (newVal) bpm.value = newVal;
}, { immediate: true });

// Sync BPM back to settings when changed by user manually
watch(bpm, (newVal) => {
  repertoireStore.updateSettings({ metronomeBpm: newVal });
});

// Tuner Logic
const { currentPitch, currentNote, currentCents, start: startTuner, stop: stopTuner } = useTuner();
const isTunerActive = ref(false);

const tunerNote = currentNote;
const tunerPitch = currentPitch;
const tunerCents = currentCents;

const isTuned = computed(() => {
  return Math.abs(tunerCents.value) < 5; // within 5 cents is considered in tune
});

watch(isTunerActive, async (active) => {
  if (active) {
    const lang = repertoireStore.state.value.settings.voiceCommandLanguage;
    try {
      await startTuner(lang);
    } catch (e) {
      console.error(e);
      isTunerActive.value = false;
    }
  } else {
    stopTuner();
  }
});

// Voice command exposure for Parent
const voiceToggleTuner = () => {
  isTunerActive.value = !isTunerActive.value;
};

const voiceStartMetronome = (newBpm?: number) => {
  if (newBpm) bpm.value = newBpm;
  startMetronome();
};

const voiceStopMetronome = () => {
  stopMetronome();
};

defineExpose({
  voiceToggleTuner,
  voiceStartMetronome,
  voiceStopMetronome
});

onBeforeUnmount(() => {
  stopTuner();
  stopMetronome();
});
</script>
