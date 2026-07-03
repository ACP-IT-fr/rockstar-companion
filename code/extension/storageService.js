/**
 * Service de stockage abstrait pour Vox Roddy
 * Encapsule les accès à chrome.storage.local pour faciliter une future migration vers une API REST.
 */
const storageService = {
  /**
   * Récupère tous les morceaux sauvegardés.
   * @returns {Promise<Record<string, any>>}
   */
  getAllSongs() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('saved_songs', (result) => {
          resolve(result.saved_songs || {});
        });
      } else {
        // Fallback pour le développement hors-extension
        try {
          const songs = localStorage.getItem('saved_songs');
          resolve(songs ? JSON.parse(songs) : {});
        } catch (e) {
          resolve({});
        }
      }
    });
  },

  /**
   * Récupère un morceau spécifique à partir de son URL.
   * @param {string} url - URL du morceau
   * @returns {Promise<any|null>}
   */
  getSong(url) {
    return this.getAllSongs().then((songs) => {
      return songs[url] || null;
    });
  },

  /**
   * Sauvegarde ou met à jour un morceau.
   * @param {any} song - Les données du morceau
   * @returns {Promise<void>}
   */
  saveSong(song) {
    if (!song || !song.url) return Promise.reject("Invalid song data: URL is required.");
    
    return this.getAllSongs().then((songs) => {
      const existing = songs[song.url] || {};
      songs[song.url] = {
        url: song.url,
        title: song.title || existing.title || "Titre inconnu",
        artist: song.artist || existing.artist || "Artiste inconnu",
        key: song.key !== undefined ? song.key : (existing.key || ""),
        capo: song.capo !== undefined ? parseInt(song.capo, 10) : (existing.capo !== undefined ? existing.capo : 0),
        transpose: song.transpose !== undefined ? parseInt(song.transpose, 10) : (existing.transpose !== undefined ? existing.transpose : 0),
        interpretationNotes: song.interpretationNotes !== undefined ? song.interpretationNotes : (existing.interpretationNotes || ""),
        playingTips: song.playingTips !== undefined ? song.playingTips : (existing.playingTips || ""),
        links: song.links || existing.links || [],
        savedAt: Date.now()
      };

      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ saved_songs: songs }, () => {
            resolve();
          });
        } else {
          localStorage.setItem('saved_songs', JSON.stringify(songs));
          resolve();
        }
      });
    });
  },

  /**
   * Supprime un morceau à partir de son URL.
   * @param {string} url - URL du morceau à supprimer
   * @returns {Promise<void>}
   */
  deleteSong(url) {
    if (!url) return Promise.reject("Invalid URL: URL is required for deletion.");

    return this.getAllSongs().then((songs) => {
      if (songs[url]) {
        delete songs[url];
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ saved_songs: songs }, () => {
              resolve();
            });
          } else {
            localStorage.setItem('saved_songs', JSON.stringify(songs));
            resolve();
          }
        });
      }
    });
  }
};

// Rendre accessible globalement dans l'extension
window.storageService = storageService;
