/**
 * Service de stockage abstrait pour Vox Roddy
 * Encapsule les accès à chrome.storage.local pour faciliter une future migration vers une API REST.
 *
 * Layout : une clé par morceau (`song:<url normalisée>`). Évite de réécrire
 * tout le répertoire à chaque édition et limite la portée d'une écriture
 * concurrente (dernier écrivain gagne par morceau, plus par blob global).
 *
 * Compatibilité : les données historiques vivent dans une clé unique
 * `saved_songs` (map url → morceau). Elles sont migrées une seule fois vers le
 * nouveau layout, puis l'ancienne clé est supprimée. Migration idempotente.
 */
const storageService = {
  LEGACY_KEY: 'saved_songs',
  KEY_PREFIX: 'song:',

  _keyFor(url) {
    return this.KEY_PREFIX + url;
  },

  _hasChrome() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  },

  _get(keys) {
    return new Promise((resolve, reject) => {
      if (this._hasChrome()) {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result || {});
        });
      } else {
        // Fallback pour le développement hors-extension
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
          try {
            const val = localStorage.getItem(k);
            out[k] = val !== null ? JSON.parse(val) : undefined;
          } catch (e) {
            out[k] = undefined;
          }
        });
        resolve(out);
      }
    });
  },

  _set(obj) {
    return new Promise((resolve, reject) => {
      if (this._hasChrome()) {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } else {
        for (const [k, v] of Object.entries(obj)) {
          localStorage.setItem(k, JSON.stringify(v));
        }
        resolve();
      }
    });
  },

  _remove(keys) {
    return new Promise((resolve) => {
      if (this._hasChrome()) {
        chrome.storage.local.remove(keys, () => resolve());
      } else {
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => localStorage.removeItem(k));
        resolve();
      }
    });
  },

  /**
   * Migration unique : ancienne map `saved_songs` → clés `song:<url>`.
   * Idempotente ; supprime l'ancienne clé après écriture réussie.
   * @returns {Promise<void>}
   */
  migrate() {
    if (this._migratePromise) return this._migratePromise;
    this._migratePromise = this._get(this.LEGACY_KEY).then((result) => {
      const legacy = result[this.LEGACY_KEY];
      if (!legacy || typeof legacy !== 'object') return;
      const writes = {};
      Object.values(legacy).forEach((song) => {
        if (!song || !song.url) return;
        writes[this._keyFor(song.url)] = this._normalize(song);
      });
      return this._set(writes).then(() => this._remove(this.LEGACY_KEY));
    }).catch((e) => {
      console.error('[storageService] migration échouée :', e);
      this._migratePromise = null; // retenter au prochain accès
    });
    return this._migratePromise;
  },

  _normalize(song, existing) {
    // Champ canonique : `notes`. `interpretationNotes` est un alias historique :
    // converti une fois à la migration / première écriture, jamais réécrit.
    const notes = song.notes !== undefined
      ? String(song.notes)
      : String(
          (existing && existing.notes) ||
          song.interpretationNotes ||
          (existing && existing.interpretationNotes) ||
          ''
        );
    return {
      url: song.url,
      title: song.title || (existing && existing.title) || 'Titre inconnu',
      artist: song.artist || (existing && existing.artist) || 'Artiste inconnu',
      key: song.key !== undefined ? song.key : ((existing && existing.key) || ''),
      capo: song.capo !== undefined ? (parseInt(song.capo, 10) || 0) : ((existing && existing.capo) || 0),
      transpose: song.transpose !== undefined ? (parseInt(song.transpose, 10) || 0) : ((existing && existing.transpose) || 0),
      scrollSpeed: song.scrollSpeed !== undefined ? (parseInt(song.scrollSpeed, 10) || 1) : ((existing && existing.scrollSpeed) || 1),
      notes: notes,
      playingTips: song.playingTips !== undefined ? String(song.playingTips) : ((existing && existing.playingTips) || ''),
      links: Array.isArray(song.links) ? song.links : ((existing && existing.links) || []),
      savedAt: Date.now()
    };
  },

  /**
   * Récupère tous les morceaux sauvegardés sous forme de map { url → morceau }.
   * (Format historique, utilisé par le dashboard et l'export.)
   * @returns {Promise<Record<string, any>>}
   */
  getAllSongs() {
    return this.migrate().then(() => this._get(null)).then((result) => {
      const map = {};
      Object.keys(result || {}).forEach((k) => {
        if (k.startsWith(this.KEY_PREFIX) && result[k] && result[k].url) {
          map[result[k].url] = result[k];
        }
      });
      return map;
    });
  },

  /**
   * Liste des morceaux triés par date de sauvegarde décroissante.
   * @returns {Promise<Array<any>>}
   */
  getAllSongsList() {
    return this.getAllSongs().then((map) =>
      Object.values(map).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    );
  },

  /**
   * Récupère un morceau spécifique à partir de son URL.
   * @param {string} url - URL normalisée du morceau
   * @returns {Promise<any|null>}
   */
  getSong(url) {
    if (!url) return Promise.resolve(null);
    return this.migrate().then(() => this._get(this._keyFor(url))).then((result) => {
      return result[this._keyFor(url)] || null;
    });
  },

  /**
   * Sauvegarde ou met à jour un morceau (écriture d'une seule clé).
   * @param {any} song - Les données du morceau (song.url requis)
   * @returns {Promise<void>}
   */
  saveSong(song) {
    if (!song || !song.url) return Promise.reject(new Error('Invalid song data: URL is required.'));

    return this.getSong(song.url).then((existing) => {
      const normalized = this._normalize(song, existing);
      return this._set({ [this._keyFor(song.url)]: normalized }).then(() => {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('rockstar-song-updated', { detail: normalized }));
        }
      });
    });
  },

  /**
   * Supprime un morceau à partir de son URL.
   * @param {string} url - URL normalisée du morceau
   * @returns {Promise<void>}
   */
  deleteSong(url) {
    if (!url) return Promise.reject(new Error('Invalid URL: URL is required for deletion.'));
    return this._remove(this._keyFor(url));
  }
};

// Rendre accessible globalement dans l'extension
window.storageService = storageService;