import { reactive, computed, watch } from 'vue';
import { dbService, type Song, type Setlist } from '../services/db';

export interface AppSettings {
  voiceCommandLanguage: 'fr-FR' | 'en-US';
  voiceActive: boolean;
  tunerActive: boolean;
  pitchTrackerActive: boolean;
  metronomeActive: boolean;
  metronomeBpm: number;
}

interface State {
  songs: Song[];
  setlists: Setlist[];
  currentSongId: string | null;
  currentSetlistId: string | null;
  settings: AppSettings;
  isLoaded: boolean;
}

// Load settings from localStorage if available
const savedSettings = localStorage.getItem('rockstar_settings');
const defaultSettings: AppSettings = savedSettings 
  ? JSON.parse(savedSettings) 
  : {
      voiceCommandLanguage: navigator.language.startsWith('en') ? 'en-US' : 'fr-FR',
      voiceActive: true,
      tunerActive: false,
      pitchTrackerActive: false,
      metronomeActive: false,
      metronomeBpm: 120,
    };

const state = reactive<State>({
  songs: [],
  setlists: [],
  currentSongId: null,
  currentSetlistId: null,
  settings: defaultSettings,
  isLoaded: false
});

// Watch settings to persist in localStorage
watch(() => state.settings, (newVal) => {
  localStorage.setItem('rockstar_settings', JSON.stringify(newVal));
}, { deep: true });

// --- Sample Data for Pre-population ---
const SAMPLE_SONGS: Song[] = [
  {
    id: 'sample-1',
    title: 'Hotel California',
    artist: 'Eagles',
    sourceType: 'url',
    url: 'https://tabs.ultimate-guitar.com/tab/eagles/hotel-california-chords-46755',
    youtubeUrl: 'https://www.youtube.com/watch?v=09839DpTctU',
    capo: 7,
    transpose: 0,
    notes: 'Intro arpeggio: Bm - F#7 - A - E - G - D - Em - F#7\nClair de guitare à la fin avec solos alternés.',
    createdAt: Date.now() - 5000
  },
  {
    id: 'sample-2',
    title: 'Wish You Were Here',
    artist: 'Pink Floyd',
    sourceType: 'url',
    url: 'https://tabs.ultimate-guitar.com/tab/pink-floyd/wish-you-were-here-chords-60248',
    youtubeUrl: 'https://www.youtube.com/watch?v=IXxDz8s-V2Q',
    capo: 0,
    transpose: 0,
    notes: 'Intro riff sur G et Em7.\nSolo acoustique d\'introduction en Sol majeur.',
    createdAt: Date.now() - 4000
  },
  {
    id: 'sample-3',
    title: 'Wonderwall',
    artist: 'Oasis',
    sourceType: 'url',
    url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596',
    youtubeUrl: 'https://www.youtube.com/watch?v=6hzrDeceEKc',
    capo: 2,
    transpose: 0,
    notes: 'Accords ouverts en permanence (garder le 3e et 4e doigt en case 3).\nStrumming rythmique soutenu.',
    createdAt: Date.now() - 3000
  }
];

const SAMPLE_SETLISTS: Setlist[] = [
  {
    id: 'setlist-sample',
    name: 'Concert Acoustique',
    songIds: ['sample-2', 'sample-3', 'sample-1'],
    createdAt: Date.now()
  }
];

export const repertoireStore = {
  // Read-only state wrappers
  state: computed(() => state),
  songs: computed(() => state.songs),
  setlists: computed(() => state.setlists),
  currentSong: computed(() => state.songs.find(s => s.id === state.currentSongId) || null),
  currentSetlist: computed(() => state.setlists.find(sl => sl.id === state.currentSetlistId) || null),
  
  // Computed helpers for setlist navigation
  currentSetlistSongs: computed(() => {
    const sl = state.setlists.find(s => s.id === state.currentSetlistId);
    if (!sl) return [];
    return sl.songIds
      .map(id => state.songs.find(s => s.id === id))
      .filter((s): s is Song => !!s);
  }),
  
  currentSongIndexInSetlist: computed(() => {
    const sl = state.setlists.find(s => s.id === state.currentSetlistId);
    if (!sl || !state.currentSongId) return -1;
    return sl.songIds.indexOf(state.currentSongId);
  }),

  // Initialize store and database
  async init() {
    try {
      let songs = await dbService.getSongs();
      let setlists = await dbService.getSetlists();

      // Prepopulate with samples if empty
      if (songs.length === 0) {
        for (const sample of SAMPLE_SONGS) {
          await dbService.saveSong(sample);
        }
        songs = await dbService.getSongs();
      }

      if (setlists.length === 0) {
        for (const sampleSl of SAMPLE_SETLISTS) {
          await dbService.saveSetlist(sampleSl);
        }
        setlists = await dbService.getSetlists();
      }

      state.songs = songs.sort((a, b) => b.createdAt - a.createdAt);
      state.setlists = setlists.sort((a, b) => b.createdAt - a.createdAt);
      
      // Auto-select first song and setlist
      if (state.songs.length > 0) {
        state.currentSongId = state.songs[0].id;
      }
      if (state.setlists.length > 0) {
        state.currentSetlistId = state.setlists[0].id;
      }
      
      state.isLoaded = true;
    } catch (e) {
      console.error('Failed to initialize repertoire store', e);
    }
  },

  // --- Song Actions ---
  async addSong(song: Song) {
    await dbService.saveSong(song);
    state.songs.unshift(song);
    if (!state.currentSongId) {
      state.currentSongId = song.id;
    }
  },

  async updateSong(song: Song) {
    await dbService.saveSong(song);
    const idx = state.songs.findIndex(s => s.id === song.id);
    if (idx !== -1) {
      state.songs[idx] = song;
    }
    if (state.currentSongId === song.id) {
      // Force trigger reactivity
      state.currentSongId = null;
      state.currentSongId = song.id;
    }
  },

  async deleteSong(id: string) {
    await dbService.deleteSong(id);
    state.songs = state.songs.filter(s => s.id !== id);
    
    // Remove from all setlists
    for (const setlist of state.setlists) {
      if (setlist.songIds.includes(id)) {
        setlist.songIds = setlist.songIds.filter(sid => sid !== id);
        await dbService.saveSetlist(setlist);
      }
    }

    if (state.currentSongId === id) {
      state.currentSongId = state.songs.length > 0 ? state.songs[0].id : null;
    }
  },

  selectSong(id: string) {
    if (state.songs.some(s => s.id === id)) {
      state.currentSongId = id;
    }
  },

  // --- Setlist Actions ---
  async addSetlist(name: string) {
    const newSl: Setlist = {
      id: 'setlist-' + Math.random().toString(36).substr(2, 9),
      name,
      songIds: [],
      createdAt: Date.now()
    };
    await dbService.saveSetlist(newSl);
    state.setlists.unshift(newSl);
    state.currentSetlistId = newSl.id;
    return newSl;
  },

  async updateSetlist(setlist: Setlist) {
    await dbService.saveSetlist(setlist);
    const idx = state.setlists.findIndex(sl => sl.id === setlist.id);
    if (idx !== -1) {
      state.setlists[idx] = setlist;
    }
  },

  async deleteSetlist(id: string) {
    await dbService.deleteSetlist(id);
    state.setlists = state.setlists.filter(sl => sl.id !== id);
    if (state.currentSetlistId === id) {
      state.currentSetlistId = state.setlists.length > 0 ? state.setlists[0].id : null;
    }
  },

  selectSetlist(id: string | null) {
    state.currentSetlistId = id;
    const songs = this.currentSetlistSongs.value;
    if (songs.length > 0 && !songs.some(s => s.id === state.currentSongId)) {
      state.currentSongId = songs[0].id;
    }
  },

  // --- Navigation Actions ---
  nextSong() {
    const songs = this.currentSetlistSongs.value;
    const idx = this.currentSongIndexInSetlist.value;
    if (songs.length > 0 && idx !== -1 && idx < songs.length - 1) {
      state.currentSongId = songs[idx + 1].id;
    }
  },

  prevSong() {
    const songs = this.currentSetlistSongs.value;
    const idx = this.currentSongIndexInSetlist.value;
    if (songs.length > 0 && idx > 0) {
      state.currentSongId = songs[idx - 1].id;
    }
  },

  // --- Settings Actions ---
  updateSettings(settings: Partial<AppSettings>) {
    state.settings = {
      ...state.settings,
      ...settings
    };
  }
};
