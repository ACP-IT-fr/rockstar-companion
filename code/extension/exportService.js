/**
 * Service d'exportation pour Rockstar Companion
 * Permet d'exporter et importer les chansons et notes locales au format JSON.
 */
const exportService = {
  /**
   * Récupère l'ensemble des chansons sous forme de chaîne JSON.
   * @returns {Promise<string>}
   */
  exportData() {
    if (!window.storageService) return Promise.reject("storageService is not loaded.");
    return window.storageService.getAllSongs().then((songs) => {
      return JSON.stringify(songs, null, 2);
    });
  },

  /**
   * Importe et fusionne des chansons à partir d'une chaîne JSON.
   * @param {string} jsonString - Le JSON sous forme de chaîne
   * @returns {Promise<void>}
   */
  importData(jsonString) {
    if (!window.storageService) return Promise.reject("storageService is not loaded.");
    
    try {
      const importedSongs = JSON.parse(jsonString);
      if (typeof importedSongs !== 'object' || importedSongs === null) {
        throw new Error("Le contenu importé doit être un objet JSON valide.");
      }

      // Validation rapide de la structure
      for (const [url, song] of Object.entries(importedSongs)) {
        if (!song || typeof song !== 'object' || !song.url) {
          throw new Error(`Format de morceau invalide pour l'URL : ${url}`);
        }
      }

      return window.storageService.getAllSongs().then((currentSongs) => {
        // Fusion des anciennes chansons et des nouvelles importées
        const merged = { ...currentSongs, ...importedSongs };
        
        return new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ saved_songs: merged }, () => {
              resolve();
            });
          } else {
            localStorage.setItem('saved_songs', JSON.stringify(merged));
            resolve();
          }
        });
      });
    } catch (e) {
      return Promise.reject("Erreur d'importation : " + e.message);
    }
  }
};

// Rendre accessible globalement
window.exportService = exportService;
