export interface Song {
  id: string;
  title: string;
  artist: string;
  sourceType: 'pdf' | 'url';
  pdfBlob?: Blob;
  pdfName?: string;
  url?: string;
  youtubeUrl?: string;
  spotifyUri?: string;
  capo: number;
  transpose: number;
  notes: string;
  createdAt: number;
}

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
}

const DB_NAME = 'RockstarCompanionDB';
const DB_VERSION = 1;

class DbService {
  private db: IDBDatabase | null = null;

  private initDb(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB database.');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Create store for songs
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' });
        }
        
        // Create store for setlists
        if (!db.objectStoreNames.contains('setlists')) {
          db.createObjectStore('setlists', { keyPath: 'id' });
        }
      };
    });
  }

  // --- Song Operations ---

  public async getSongs(): Promise<Song[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('songs', 'readonly');
      const store = transaction.objectStore('songs');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async saveSong(song: Song): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('songs', 'readwrite');
      const store = transaction.objectStore('songs');
      const request = store.put(song);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async deleteSong(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('songs', 'readwrite');
      const store = transaction.objectStore('songs');
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // --- Setlist Operations ---

  public async getSetlists(): Promise<Setlist[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('setlists', 'readonly');
      const store = transaction.objectStore('setlists');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async saveSetlist(setlist: Setlist): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('setlists', 'readwrite');
      const store = transaction.objectStore('setlists');
      const request = store.put(setlist);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public async deleteSetlist(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('setlists', 'readwrite');
      const store = transaction.objectStore('setlists');
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

export const dbService = new DbService();
