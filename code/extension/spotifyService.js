/**
 * Service d'authentification et d'intégration Spotify pour Rockstar Companion.
 * Supporte le flux OAuth d'extension Chrome (chrome.identity) et un fallback Web PWA standard.
 */
const spotifyService = {
  // Client ID par défaut (l'utilisateur peut le configurer depuis l'interface)
  defaultClientId: '8e44f4e7c7e94e419890a597a78e7c10', // Client ID fictif par défaut pour la structure
  
  /**
   * Récupère le Client ID configuré par l'utilisateur ou retourne celui par défaut.
   * @returns {Promise<string>}
   */
  getClientId() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('spotify_client_id', (res) => {
          resolve(res.spotify_client_id || this.defaultClientId);
        });
      } else {
        resolve(localStorage.getItem('spotify_client_id') || this.defaultClientId);
      }
    });
  },

  /**
   * Sauvegarde le Client ID configuré.
   * @param {string} clientId 
   * @returns {Promise<void>}
   */
  saveClientId(clientId) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ spotify_client_id: clientId }, () => resolve());
      } else {
        localStorage.setItem('spotify_client_id', clientId);
        resolve();
      }
    });
  },

  /**
   * Obtient l'URL de redirection de l'API identity ou de la page en cours.
   */
  getRedirectUri() {
    if (typeof chrome !== 'undefined' && chrome.identity) {
      return chrome.identity.getRedirectURL();
    }
    // Fallback URL locale
    return window.location.origin + window.location.pathname;
  },

  /**
   * Lance le flux d'authentification Spotify.
   */
  login() {
    return this.getClientId().then((clientId) => {
      const redirectUri = this.getRedirectUri();
      const scopes = 'user-read-playback-state user-modify-playback-state streaming user-read-currently-playing';
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
      
      if (typeof chrome !== 'undefined' && chrome.identity) {
        return new Promise((resolve, reject) => {
          chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
          }, (redirectUrl) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError.message);
              return;
            }
            
            if (redirectUrl) {
              try {
                const urlObj = new URL(redirectUrl);
                const hash = urlObj.hash.substring(1);
                const params = new URLSearchParams(hash);
                const token = params.get('access_token');
                
                if (token) {
                  chrome.storage.local.set({ spotify_access_token: token }, () => {
                    resolve(token);
                  });
                } else {
                  reject("Jeton d'accès non trouvé dans l'URL de redirection.");
                }
              } catch (e) {
                reject("Erreur d'analyse de l'URL de redirection : " + e.message);
              }
            } else {
              reject("Aucune URL de redirection reçue de Spotify.");
            }
          });
        });
      } else {
        // Flux de redirection classique pour le fallback web/PWA
        window.location.href = authUrl;
        return Promise.resolve(null);
      }
    });
  },

  /**
   * Vérifie si l'utilisateur est connecté et récupère le jeton.
   * @returns {Promise<string|null>}
   */
  getToken() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('spotify_access_token', (res) => {
          resolve(res.spotify_access_token || null);
        });
      } else {
        resolve(localStorage.getItem('spotify_access_token') || null);
      }
    });
  },

  /**
   * Enregistre un jeton d'accès (utile pour la capture de hash PWA).
   * @param {string} token 
   * @returns {Promise<void>}
   */
  saveToken(token) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ spotify_access_token: token }, () => resolve());
      } else {
        localStorage.setItem('spotify_access_token', token);
        resolve();
      }
    });
  },

  /**
   * Déconnecte Spotify en supprimant le jeton.
   * @returns {Promise<void>}
   */
  /**
   * Déconnecte Spotify en supprimant le jeton.
   * @returns {Promise<void>}
   */
  logout() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove('spotify_access_token', () => resolve());
      } else {
        localStorage.removeItem('spotify_access_token');
        resolve();
      }
    });
  },

  /**
   * Effectue une requête authentifiée auprès de l'API Spotify.
   */
  _apiCall(endpoint, method = 'GET', body = null) {
    return this.getToken().then((token) => {
      if (!token) {
        return Promise.reject("Non authentifié à Spotify. Veuillez vous connecter dans le Dashboard.");
      }
      const headers = {
        'Authorization': `Bearer ${token}`
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
      
      return fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : null
      }).then(response => {
        if (response.status === 204) {
          return null;
        }
        if (response.status === 401) {
          this.logout();
          return Promise.reject("Session Spotify expirée. Veuillez vous reconnecter.");
        }
        
        // Certains endpoints peuvent ne pas retourner de contenu mais un statut OK
        return response.text().then(text => {
          if (!text) return null;
          try {
            const data = JSON.parse(text);
            if (!response.ok) {
              return Promise.reject(data.error?.message || "Erreur de l'API Spotify");
            }
            return data;
          } catch(e) {
            if (!response.ok) {
              return Promise.reject("Erreur de l'API Spotify");
            }
            return text;
          }
        });
      });
    });
  },

  /**
   * Lance la lecture d'un morceau Spotify ou reprend la lecture en cours.
   * @param {string} [uri] URI Spotify (ex: spotify:track:xxxx)
   */
  play(uri = null) {
    const body = uri ? { uris: [uri] } : null;
    return this._apiCall('/me/player/play', 'PUT', body);
  },

  /**
   * Met en pause la lecture Spotify.
   */
  pause() {
    return this._apiCall('/me/player/pause', 'PUT');
  },

  /**
   * Se déplace à une position donnée.
   * @param {number} positionMs 
   */
  seek(positionMs) {
    return this._apiCall(`/me/player/seek?position_ms=${Math.round(positionMs)}`, 'PUT');
  },

  /**
   * Récupère l'état actuel de la lecture.
   */
  getPlaybackState() {
    return this._apiCall('/me/player');
  },

  /**
   * Recule de X secondes sur Spotify.
   * @param {number} seconds 
   */
  rewind(seconds = 10) {
    return this.getPlaybackState().then(state => {
      if (state && state.progress_ms !== undefined) {
        const newPos = Math.max(0, state.progress_ms - (seconds * 1000));
        return this.seek(newPos);
      }
      return this.seek(0);
    });
  },

  /**
   * Extrait l'URI Spotify depuis une URL classique.
   */
  getSpotifyUri(url) {
    try {
      if (!url) return null;
      if (url.startsWith('spotify:')) return url;
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('spotify.com')) {
        const paths = urlObj.pathname.split('/');
        const type = paths[1];
        const trackId = paths[2];
        if (type && trackId) {
          return `spotify:${type}:${trackId}`;
        }
      }
    } catch (e) {}
    return null;
  }
};

window.spotifyService = spotifyService;
