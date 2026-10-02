/**
 * driveSyncService.js — synchronisation du répertoire avec Google Drive.
 *
 * Fichier JSON `vox-roddy-repertoire.json` dans le dossier privé appDataFolder
 * de Drive (invisible pour l'utilisateur, hors quota). Auth via
 * chrome.identity.getAuthToken (OAuth2, scope drive.appdata).
 *
 * Fusion : dernier écrivain gagne par morceau (champ savedAt). Les
 * suppressions sont conservées sous forme de pierres tombales (url → date),
 * localement (clés `song:deleted:<url>`) et dans le fichier Drive (champ
 * `deleted`), pour qu'un morceau supprimé ne ressuscite pas à la synchro.
 *
 * La logique de fusion est pure (mergeRepertoire) : testée hors navigateur
 * dans code/tests/run-tests.js. Les appels réseau/Drive sont isolés.
 */
const driveSyncService = {
  DRIVE_FILE_NAME: 'vox-roddy-repertoire.json',
  TOMBSTONE_PREFIX: 'song:deleted:',
  APPDATA_BASE: 'https://www.googleapis.com/drive/v3',
  UPLOAD_BASE: 'https://www.googleapis.com/upload/drive/v3',
  SCOPE: 'https://www.googleapis.com/auth/drive.appdata',

  // --- Prérequis ----------------------------------------------------------

  _hasChromeIdentity() {
    return typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getAuthToken;
  },

  _clientId() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getManifest) return '';
    const oauth2 = chrome.runtime.getManifest().oauth2;
    const clientId = (oauth2 && oauth2.client_id) || '';
    return /^REMPLACER/.test(clientId) ? '' : clientId;
  },

  /**
   * La synchro n'est disponible que si le manifest déclare un client OAuth2.
   * S'il manque, l'UI le signale sans jargon au lieu d'ouvrir un popup Google
   * qui échouerait.
   * @returns {boolean}
   */
  isAvailable() {
    return this._hasChromeIdentity() && this._clientId().length > 0;
  },

  // --- Auth -----------------------------------------------------------------

  // Délai maximal d'attente du jeton Google. Sans lui, un échec silencieux de
  // chrome.identity.getAuthToken (popup raté, bug MV3) laisse l'UI bloquée
  // sur « Synchronisation… » pour toujours.
  AUTH_TIMEOUT_MS: 90000,

  getToken() {
    // 1) Essai silencieux : utilise le jeton en cache s'il est encore valable,
    //    sans ouvrir de popup. Un cache pourri fait souvent pendre le flux
    //    interactif ; l'échec silencieux, lui, remonte un vrai message.
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false, scopes: [this.SCOPE] }, (token) => {
        if (!chrome.runtime.lastError && token) {
          console.log('[driveSyncService] jeton obtenu (cache)');
          resolve(token);
          return;
        }
        if (chrome.runtime.lastError) {
          console.log('[driveSyncService] pas de jeton en cache :', chrome.runtime.lastError.message);
        }
        resolve(null);
      });
    }).then((cached) => {
      if (cached) return cached;

      // 2) Flux interactif, avec garde-fou : sans lui, un échec silencieux de
      //    getAuthToken (popup ratée, bug MV3) laisse l'UI bloquée pour toujours.
      return new Promise((resolve, reject) => {
        const settled = { done: false };
        const timer = setTimeout(() => {
          if (settled.done) return;
          settled.done = true;
          reject(new Error('auth-timeout'));
        }, this.AUTH_TIMEOUT_MS);
        console.log('[driveSyncService] ouverture de la fenêtre de connexion Google…');
        chrome.identity.getAuthToken({ interactive: true, scopes: [this.SCOPE] }, (token) => {
          if (settled.done) return; // le timeout a déjà tranché
          settled.done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            console.error('[driveSyncService] jeton refusé :', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          console.log('[driveSyncService] jeton obtenu');
          resolve(token);
        });
      });
    });
  },

  // --- Drive (appDataFolder) -------------------------------------------------

  _driveFetch(url, options, token) {
    // Fusionner les en-têtes plutôt que les remplacer : sans ça, un appel qui
    // passe son propre Content-Type écrase le Authorization et Google répond 401.
    const extra = options || {};
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, extra.headers || {});
    const opts = Object.assign({}, extra, { headers: headers });
    return fetch(url, opts).then((res) => {
      if (!res.ok) {
        // 401 : jeton expiré/revoqué → vider le cache Chrome et laisser retenter.
        if (res.status === 401 && chrome.identity.removeCachedAuthToken) {
          chrome.identity.removeCachedAuthToken({ token: token }, () => {});
        }
        // Le corps contient la vraie raison (api non activée, quota, etc.).
        return res.json().then((err) => {
          const detail = err && err.error && err.error.message;
          if (detail) console.error('[driveSyncService] Drive ' + res.status + ' : ' + detail);
          throw new Error('Drive HTTP ' + res.status + (detail ? ' : ' + detail : ''));
        }).catch((e) => {
          if (e.message && e.message.indexOf('Drive HTTP') === 0) throw e;
          throw new Error('Drive HTTP ' + res.status);
        });
      }
      return res;
    });
  },

  /** Recherche le fichier de synchro ; null s'il n'existe pas encore. */
  findFileId(token) {
    const q = encodeURIComponent(
      "name = '" + this.DRIVE_FILE_NAME + "' and trashed = false"
    );
    return this._driveFetch(this.APPDATA_BASE + '/files?spaces=appDataFolder&q=' + q + '&fields=files(id)', null, token)
      .then((res) => res.json())
      .then((data) => (data.files && data.files.length > 0 ? data.files[0].id : null));
  },

  readFile(token) {
    return this.findFileId(token).then((fileId) => {
      if (!fileId) return null;
      return this._driveFetch(this.APPDATA_BASE + '/files/' + fileId + '?alt=media', null, token)
        .then((res) => res.json())
        .catch((e) => {
          console.error('[driveSyncService] lecture échouée :', e);
          return null; // fichier illisible → repartir de l'état local
        });
    });
  },

  writeFile(doc, token) {
    return this.findFileId(token).then((fileId) => {
      const body = JSON.stringify(doc);
      if (fileId) {
        return this._driveFetch(this.UPLOAD_BASE + '/files/' + fileId + '?uploadType=media', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: body
        }, token).then((res) => res.json());
      }
      // uploadType=media sans métadonnées crée le fichier à la racine du Drive
      // (interdit avec le scope drive.appdata → 403). Créer d'abord le fichier
      // DANS appDataFolder via ses métadonnées, puis écrire son contenu.
      return this._driveFetch(this.APPDATA_BASE + '/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.DRIVE_FILE_NAME, parents: ['appDataFolder'] })
      }, token).then((res) => res.json()).then((meta) => {
        return this._driveFetch(this.UPLOAD_BASE + '/files/' + meta.id + '?uploadType=media', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: body
        }, token).then((res) => res.json());
      });
    });
  },

  // --- Fusion (pure, testée hors navigateur) ---------------------------------

  /**
   * Fusionne le répertoire local et le document Drive (format {songs, deleted}).
   * @param {Record<string, any>} localSongs map url → morceau
   * @param {{songs?: Object, deleted?: Object}|null} remoteDoc document Drive
   * @param {Record<string, number>} localTombstones map url → deletedAt
   * @returns {{songs: Record<string, any>, deleted: Record<string, number>,
   *            added: number, updated: number}}
   */
  mergeRepertoire(localSongs, remoteDoc, localTombstones) {
    const remoteSongs = (remoteDoc && remoteDoc.songs) || {};
    const remoteDeleted = (remoteDoc && remoteDoc.deleted) || {};
    const local = localSongs || {};
    const tombstones = Object.assign({}, localTombstones);
    const songs = {};
    const urls = new Set(
      Object.keys(local).concat(Object.keys(remoteSongs)).concat(Object.keys(remoteDeleted))
    );

    urls.forEach((url) => {
      const tomb = Math.max(tombstones[url] || 0, remoteDeleted[url] || 0);
      const localSong = local[url] || null;
      const remoteSong = remoteSongs[url] || null;

      if (!localSong && !remoteSong) {
        // Supprimé des deux côtés : garder la trace si elle est récente.
        if (tomb) tombstones[url] = tomb;
        return;
      }

      const winner =
        localSong && remoteSong
          ? ((remoteSong.savedAt || 0) > (localSong.savedAt || 0) ? remoteSong : localSong)
          : (remoteSong || localSong);

      if (tomb && (winner.savedAt || 0) <= tomb) {
        // La suppression est plus récente que le morceau : elle gagne.
        tombstones[url] = tomb;
        return;
      }
      songs[url] = winner;
    });

    return { songs: songs, deleted: tombstones };
  },

  // --- Lecture locale ---------------------------------------------------------

  _getTombstones() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(null, (result) => {
          const tombs = {};
          Object.keys(result || {}).forEach((k) => {
            if (k.startsWith(this.TOMBSTONE_PREFIX) && result[k] && result[k].deletedAt) {
              tombs[result[k].url] = result[k].deletedAt;
            }
          });
          resolve(tombs);
        });
      } else {
        resolve({});
      }
    });
  },

  _deleteTombstoneKey(url) {
    return 'song:deleted:' + url;
  },

  /**
   * Applique le résultat d'une fusion au stockage local : écrit les morceaux
   * gagnants (date preserved) et les pierres tombales, supprime les clés des
   * morceaux disparus. Notifie la liste/tiroir via les événements existants.
   * @returns {Promise<void>}
   */
  applyMerged(merged) {
    const writes = {};
    const removes = [];
    Object.values(merged.songs).forEach((song) => {
      writes['song:' + song.url] = song;
    });
    Object.entries(merged.deleted).forEach(([url, deletedAt]) => {
      writes[this._deleteTombstoneKey(url)] = { url: url, deletedAt: deletedAt };
    });

    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.get(null, (result) => {
        Object.keys(result || {}).forEach((k) => {
          if (k.startsWith('song:') && !k.startsWith(this.TOMBSTONE_PREFIX) && !merged.songs[result[k] && result[k].url]) {
            removes.push(k);
          }
        });
        chrome.storage.local.set(writes, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          chrome.storage.local.remove(removes, () => {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('rockstar-song-updated', { detail: null }));
            }
            resolve();
          });
        });
      });
    });
  },

  // --- Synchro complète -------------------------------------------------------

  /**
   * Signature Google (si besoin) puis fusion locale ↔ Drive, dans les deux sens.
   * @returns {Promise<{added: number, updated: number, deleted: number}>}
   */
  sync() {
    if (this._syncing) {
      return Promise.reject(new Error('already-running'));
    }
    if (!this._hasChromeIdentity()) {
      return Promise.reject(new Error('no-identity'));
    }
    if (!this._clientId()) {
      return Promise.reject(new Error('no-client-id'));
    }
    this._syncing = true;
    return this.getToken()
      .then((token) => {
        console.log('[driveSyncService] synchro : lecture locale + Drive…');
        return Promise.all([
          window.storageService ? window.storageService.getAllSongs() : Promise.resolve({}),
          this._getTombstones(),
          this.findFileId(token).then((fileId) => (fileId ? this.readFile(token) : Promise.resolve(null)))
        ]).then(([localSongs, localTombstones, remoteDoc]) => {
          const merged = this.mergeRepertoire(localSongs, remoteDoc, localTombstones);

          // Statistiques lisibles : ce qui change localement.
          const before = localSongs || {};
          let added = 0;
          let updated = 0;
          let deleted = 0;
          Object.keys(merged.songs).forEach((url) => {
            if (!before[url]) added++;
            else if ((merged.songs[url].savedAt || 0) !== (before[url].savedAt || 0)) updated++;
          });
          Object.keys(before).forEach((url) => {
            if (!merged.songs[url]) deleted++;
          });

          const doc = { format: 1, savedAt: Date.now(), songs: merged.songs, deleted: merged.deleted };
          return this.writeFile(doc, token)
            .then(() => this.applyMerged(merged))
            .then(() => ({ added: added, updated: updated, deleted: deleted }));
        });
      })
      .finally(() => {
        this._syncing = false;
      });
  }
};

// Rendre accessible globalement dans l'extension
window.driveSyncService = driveSyncService;