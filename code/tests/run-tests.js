/**
 * tests/run-tests.js — tests hors navigateur (node) du répertoire.
 * Ne couvre que la logique pure : normalizeUrl (clé de répartition du
 * stockage) et storageService (layout par morceau + migration + notes).
 *
 * Usage : node code/tests/run-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..', 'extension');

let failures = 0;
let count = 0;
function check(name, cond) {
  count++;
  if (cond) {
    console.log('  ok  ' + name);
  } else {
    failures++;
    console.error('  FAIL ' + name);
  }
}

// --- Chargeur : exécute un fichier d'extension avec des globals factices ----
function load(file, globals) {
  for (const [k, v] of Object.entries(globals)) global[k] = v;
  global.window = globals.window;
  if (globals.window.history) global.history = globals.window.history;
  const code = fs.readFileSync(file, 'utf8');
  (0, eval)(code);
}

function freshGlobals() {
  const listeners = {};
  const store = {};
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, cb) {
          let out = {};
          if (keys === null) {
            out = JSON.parse(JSON.stringify(store));
          } else {
            (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); });
          }
          setTimeout(() => cb(out), 0);
        },
        set(obj, cb) {
          Object.assign(store, JSON.parse(JSON.stringify(obj)));
          setTimeout(() => cb(), 0);
        },
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
          setTimeout(() => cb(), 0);
        },
        _store: store
      },
      onChanged: { addListener() {} }
    }
  };
  const window = {
    addEventListener() {},
    dispatchEvent() {},
    location: { href: 'https://www.ultimate-guitar.com/tab/example/song-123' },
    history: {
      pushState() {},
      replaceState() {}
    }
  };
  return { chrome, window, document: { querySelector: () => null, body: { innerText: '' } } };
}

// --- 1. storageService -------------------------------------------------------
function testStorageService() {
  console.log('\n[storageService]');
  const g = freshGlobals();
  load(path.join(EXT, 'storageService.js'), { chrome: g.chrome, window: g.window, document: g.document });
  const svc = global.window.storageService;
  check('storageService exposé', !!svc);

  return svc.saveSong({ url: 'https://www.youtube.com/watch?v=abc12345678', title: 'T1', artist: 'A1', capo: '2', notes: 'hello' })
    .then(() => svc.saveSong({ url: 'https://example.com/tab/x', title: 'T2', notes: '' }))
    .then(() => svc.getAllSongs())
    .then((map) => {
      check('deux morceaux sauvegardés', Object.keys(map).length === 2);
      check('clé par morceau (pas de blob unique)', Object.keys(g.chrome.storage.local._store).every((k) => k.startsWith('song:')));
      check('capo parsé', map['https://www.youtube.com/watch?v=abc12345678'].capo === 2);
    })
    .then(() => svc.getSong('https://example.com/tab/x'))
    .then((song) => {
      check('getSong lit une seule clé', !!song && song.title === 'T2');
    })
    .then(() => svc.getSong('https://example.com/tab/x'))
    .then((song) => {
      // Merge avec existant : la seconde sauvegarde ne perd pas les notes.
      return svc.saveSong({ url: 'https://example.com/tab/x', playingTips: 'rythme lent' })
        .then(() => svc.getSong('https://example.com/tab/x'))
        .then((updated) => {
          check('merge : notes conservées', updated.notes === '');
          check('merge : tips ajoutés', updated.playingTips === 'rythme rapide' || updated.playingTips === 'rythme lent');
        });
    })
    .then(() => svc.deleteSong('https://example.com/tab/x'))
    .then(() => svc.getAllSongs())
    .then((map) => {
      check('suppression', !map['https://example.com/tab/x']);
    })
    .then(() => {
      // Migration du legacy : ancienne map saved_songs → clés song:*
      const g2 = freshGlobals();
      g2.chrome.storage.local._store.saved_songs = {
        'https://example.com/tab/legacy': {
          url: 'https://example.com/tab/x',
          title: 'Legacy',
          artist: 'Art',
          interpretationNotes: 'vieilles notes',
          links: []
        }
      };
      load(path.join(EXT, 'storageService.js'), { chrome: g2.chrome, window: g2.window, document: g2.document });
      const svc2 = g2.window.storageService;
      return svc2.getAllSongs().then((map) => {
        const song = map['https://example.com/tab/x'];
        check('migration : morceau migré', !!song && song.title === 'Legacy');
        check('migration : interpretationNotes → notes', song && song.notes === 'vieilles notes');
        check('migration : ancienne clé supprimée', !('saved_songs' in g2.chrome.storage.local._store));
        check('migration : nouveau layout', Object.keys(g2.chrome.storage.local._store).every((k) => k.startsWith('song:')));
      });
    })
    .then(() => {
      // Rejet propre quand pas d'URL
      const g3 = freshGlobals();
      load(path.join(EXT, 'storageService.js'), { chrome: g3.chrome, window: g3.window, document: g3.document });
      return g3.window.storageService.saveSong({ title: 'no url' })
        .then(() => { check('saveSong sans url rejette', false); })
        .catch(() => { check('saveSong sans url rejette', true); });
    });
}

// --- 2. normalizeUrl (via le module réel) ------------------------------------
function testNormalizeUrl() {
  console.log('\n[normalizeUrl]');
  const g = freshGlobals();
  g.window.RockstarCore = {
    currentDomain: 'www.ultimate-guitar.com',
    isExtensionPage: false,
    registerCommand() {},
    registerHelpCommand() {},
    registerInit(fn) { g.initHook = fn; },
    onListeningChanged() {},
    onSettingsChanged() {},
    registerCommandHelp() {},
    scrollSpeed: 1
  };
  load(path.join(EXT, 'widgets', 'repertoireDrawer.js'), { chrome: g.chrome, window: g.window, document: g.document });
  const norm = g.window.RockstarCore.normalizeUrl;
  check('normalizeUrl exposé', typeof norm === 'function');
  if (typeof norm !== 'function') return Promise.resolve();

  check('youtube ?v= → canonical', norm('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s') === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  check('youtu.be → canonical', norm('https://youtu.be/dQw4w9WgXcQ') === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  check('URL sans query → origin+path', norm('https://www.ultimate-guitar.com/tab/foo?utm=x#top') === 'https://www.ultimate-guitar.com/tab/foo');
  check('URL invalide → fallback', norm('pas une url') === 'pas une url');
  return Promise.resolve();
}

testStorageService()
  .then(testNormalizeUrl)
  .then(() => {
    console.log(`\n${count} assertions, ${failures} échec(s)`);
    process.exit(failures > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });