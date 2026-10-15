// widgets/midiInput.js
// Module autonome : branche un clavier MIDI physique sur le piano virtuel
// (Web MIDI API). Ne dépend pas de la présence du piano : s'il est absent,
// le module reste inactif et n'affecte aucun autre widget.
(function() {
  'use strict';

  const TAG = '[RockstarMIDI]';

  // Le module ne s'attache que si le noyau et la Web MIDI API existent.
  function coreReady() { return !!window.RockstarCore; }
  function midiSupported() { return !!(navigator.requestMIDIAccess); }
  function pianoReady() {
    return !!(coreReady() && window.RockstarCore.pianoWidget &&
              typeof window.RockstarCore.pianoWidget.startNote === 'function');
  }

  let midiAccess = null;
  let selectedInputId = null; // null = premier input dispo
  let pillEl = null;
  let selectEl = null;
  let initialised = false;
  let midiFailed = false;
  let observer = null;
  let lastInputsSignature = null;

  // ----------------------------------------------------
  // Injected CSS (autonome : page content, sidepanel, démo)
  // ----------------------------------------------------
  const PILL_CSS = `
    .piano-midi-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.25);
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
    }
    .piano-midi-pill.connected {
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.4);
    }
    .piano-midi-pill select {
      max-width: 160px;
      background: transparent;
      color: inherit;
      border: none;
      font-size: 11px;
      cursor: pointer;
      outline: none;
    }
    .piano-midi-pill select option {
      background: #1e293b;
      color: #f1f5f9;
    }
    .piano-midi-pill .piano-midi-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #6b7280;
      flex-shrink: 0;
    }
    .piano-midi-pill.connected .piano-midi-dot {
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.7);
    }
    .piano-midi-pill:not(.connected) {
      cursor: pointer;
    }
    .piano-midi-pill select:disabled {
      cursor: inherit;
    }
  `;

  function injectStyles() {
    if (document.getElementById('rockstar-midi-input-css')) return;
    const style = document.createElement('style');
    style.id = 'rockstar-midi-input-css';
    style.textContent = PILL_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ----------------------------------------------------
  // Note routing vers le piano virtuel
  // ----------------------------------------------------
  function pianoVisible() {
    const el = document.getElementById('rockstar-piano-widget');
    return !!(el && el.classList.contains('visible'));
  }

  function handleMidiMessage(e) {
    const data = e.data;
    if (!data || data.length < 3) return;
    // Avec plusieurs périphériques, ne jouer que l'entrée sélectionnée
    if (midiAccess && midiAccess.inputs.size > 1 && selectedInputId &&
        e.target && e.target.id && e.target.id !== selectedInputId) return;

    const status = data[0] & 0xF0;
    const midi = data[1];
    const velocity = data[2];
    const noteOn = status === 0x90 && velocity > 0;
    const noteOff = status === 0x80 || (status === 0x90 && velocity === 0);
    if (!noteOn && !noteOff) return;

    // Relaie au reste de l'extension (side panel) : c'est la page web
    // qui capte le MIDI (le prompt n'y est pas bloqué) et le panneau
    // qui joue les sons / allume son clavier virtuel. On relaie même
    // si le piano local de la page est fermé.
    forwardNote(noteOn, midi);

    // Lecture locale (page web) si le piano est ouvert ici
    if (!pianoReady() || !pianoVisible()) return;
    if (noteOn) {
      window.RockstarCore.pianoWidget.startNote(midi);
    } else {
      window.RockstarCore.pianoWidget.stopNote(midi);
    }
  }

  function forwardNote(on, midi) {
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'rockstar:midi-note', on, midi }, () => {
        void chrome.runtime.lastError; // aucun récepteur : silencieux
      });
    } catch (e) { /* contexte sans runtime : ignorer */ }
  }

  // Récepteur (page d'extension : side panel) : joue les notes
  // relayées par les pages web qui ont l'accès MIDI.
  function installRelayReceiver() {
    if (!isExtensionPage()) return;
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg || msg.type !== 'rockstar:midi-note') return;
        if (!pianoReady() || !pianoVisible()) return;
        if (msg.on) {
          window.RockstarCore.pianoWidget.startNote(msg.midi);
        } else {
          window.RockstarCore.pianoWidget.stopNote(msg.midi);
        }
      });
      console.info(TAG, 'récepteur MIDI-relay installé (side panel)');
    } catch (e) { /* onMessage indisponible : ignorer */ }
  }

  // ----------------------------------------------------
  // UI : pill d'état dans le header du piano
  // ----------------------------------------------------
  function buildPill() {
    if (pillEl) return pillEl;

    pillEl = document.createElement('div');
    pillEl.className = 'piano-midi-pill';
    pillEl.title = 'Clavier MIDI physique';

    const dot = document.createElement('span');
    dot.className = 'piano-midi-dot';
    pillEl.appendChild(dot);

    selectEl = document.createElement('select');
    selectEl.setAttribute('aria-label', 'Entrée MIDI');
    selectEl.addEventListener('change', () => {
      selectedInputId = selectEl.value || null;
      attachSelectedInput();
    });
    pillEl.appendChild(selectEl);

    // Clic sur la pill : relance l'accès MIDI (permission déjà
    // accordée → résout sans prompt ; sinon, dans une page
    // d'extension, ouvre le flux onglet type micro).
    pillEl.addEventListener('click', () => {
      if (midiAccess || !midiSupported()) return;
      midiFailed = false;
      initialised = false;
      const p = initMidi(true);
      if (isExtensionPage() && p) {
        p.catch(() => openMidiPermissionTab());
      }
    });

    refreshInputList();
    return pillEl;
  }

  // Le prompt MIDI ne peut pas s'afficher dans un document de side
  // panel. Même contour que le micro (sidepanel.js : requestMic) :
  // ouvrir sidepanel.html?midi=1 dans un onglet normal, où le prompt
  // fonctionne, la permission étant mémorisée pour l'origine entière
  // de l'extension (donc valable pour le panneau aussi).
  function isExtensionPage() {
    return !!(coreReady() && window.RockstarCore.isExtensionPage &&
              typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime);
  }

  function openMidiPermissionTab() {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html?midi=1') });
    } catch (e) {
      console.warn(TAG, 'Ouverture onglet permission impossible :', e);
    }
  }

  function ensurePillMounted() {
    if (!pianoReady()) return;
    const header = document.querySelector('#rockstar-piano-widget .piano-controls');
    if (!header) return;
    injectStyles();
    if (!pillEl) buildPill();
    if (!pillEl.parentElement) header.appendChild(pillEl);
  }

  function refreshInputList(force = false) {
    if (!selectEl) return;

    // Anti-churn : ne reconstruire les options que si la liste réelle a changé.
    // (certains drivers MIDI émettent des statechange en rafale)
    if (midiAccess) {
      const signature = Array.from(midiAccess.inputs.values())
        .map(i => `${i.id}:${i.name || ''}`).join('|');
      if (!force && signature === lastInputsSignature) return;
      lastInputsSignature = signature;
    } else {
      lastInputsSignature = null;
    }

    selectEl.innerHTML = '';

    // Anti-churn aussi sur les états sans accès (pending / failed) :
    // sans ça, un rebuild à chaque observer tick re-mute le DOM.
    const stateSignature = midiAccess ? null : (midiFailed ? 'failed' : 'pending');
    if (stateSignature === lastInputsSignature) return;
    lastInputsSignature = stateSignature;

    setPillConnected(false);

    if (!midiAccess) {
      const opt = document.createElement('option');
      opt.textContent = midiFailed
        ? (isExtensionPage() ? 'MIDI : ouvrir sur une page web' : 'MIDI bloqué — cliquer')
        : (midiSupported() ? 'MIDI…' : 'MIDI indispo');
      opt.disabled = true;
      opt.selected = true;
      selectEl.appendChild(opt);
      if (midiFailed) {
        pillEl.title = isExtensionPage()
          ? 'Chrome n\'autorise pas le MIDI dans le panneau. Ouvre le piano sur une page web (Ultimate Guitar, YouTube) : la pill MIDI y fonctionnera.'
          : 'Permission MIDI refusée. Réautorise dans chrome://settings/content/midiDevices ou clique ici pour réessayer.';
      }
      return;
    }

    const inputs = Array.from(midiAccess.inputs.values());
    if (inputs.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Aucun clavier MIDI';
      opt.disabled = true;
      opt.selected = true;
      selectEl.appendChild(opt);
      return;
    }

    inputs.forEach(input => {
      const opt = document.createElement('option');
      opt.value = input.id;
      opt.textContent = input.name || 'Périphérique MIDI';
      if (selectedInputId === input.id || (!selectedInputId && input === inputs[0])) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    });

    // selectedInputId peut être tombé à null au premier branchement
    if (!selectedInputId && inputs[0]) selectedInputId = inputs[0].id;
    setPillConnected(true);
  }

  function setPillConnected(connected) {
    if (!pillEl) return;
    pillEl.classList.toggle('connected', !!connected);
  }

  function attachSelectedInput() {
    if (!midiAccess) return;
    // Handler sur TOUTES les entrées : un clavier branché après coup,
    // un changement de canal ou un driver exotique ne doit jamais
    // laisser le piano muet. Le filtre par sélection ne s'applique
    // que si plusieurs périphériques sont connectés.
    midiAccess.inputs.forEach(input => {
      input.onmidimessage = handleMidiMessage;
    });
    const current = midiAccess.inputs.get(selectedInputId);
    setPillConnected(!!current);
  }

  // ----------------------------------------------------
  // Init Web MIDI (paresseux, jamais bloquant)
  // IMPORTANT : un échec (permission refusée, pas de geste
  // utilisateur, API absente) est DÉFINITIF pour cette page.
  // On ne repart jamais en boucle de re-tentatives : c'était
  // la cause d'un gel de page (requestMIDIAccess → reject →
  // refreshInputList → mutation DOM → observer → re-request).
  // ----------------------------------------------------
  function initMidi(fromGesture = false) {
    if (initialised || midiFailed || !midiSupported()) return null;
    initialised = true;

    const p = navigator.requestMIDIAccess({ sysex: false }).then(access => {
      midiAccess = access;

      // Branchement / débranchement à chaud (anti-churn via signature)
      access.onstatechange = (e) => {
        if (e.port && e.port.type === 'input') {
          refreshInputList();
          attachSelectedInput();
        }
      };

      refreshInputList();
      attachSelectedInput();
      console.info(TAG, 'Web MIDI initialisé,', access.inputs.size, 'entrée(s)');
    }).catch(err => {
      console.warn(TAG, 'Accès MIDI refusé ou indisponible :', err);
      // Toute tentative passe désormais par un geste utilisateur
      // (pointerdown/keydown ou clic sur la pill) : l'échec est réel.
      midiFailed = true;
      refreshInputList();
    });
    return p;
  }

  // Chrome exige une activation utilisateur pour accorder le MIDI :
  // l'auto-init déclenché hors geste (observer) est refusé ou reste
  // en attente. On retente donc à chaque interaction tant que ce
  // n'est pas résolu (garde : guard initial + retrait du listener).
  function gestureInitHandler() {
    if (midiAccess || midiFailed || !midiSupported()) {
      document.removeEventListener('pointerdown', gestureInitHandler, true);
      document.removeEventListener('keydown', gestureInitHandler, true);
      return;
    }
    if (!initialised) {
      initMidi(true);
    } else {
      // Demande faite au chargement (flux ?midi=1) restée en attente :
      // on relance avec le geste, qui débloque le prompt.
      initialised = false;
      initMidi(true);
    }
    if (midiAccess || midiFailed) {
      document.removeEventListener('pointerdown', gestureInitHandler, true);
      document.removeEventListener('keydown', gestureInitHandler, true);
    }
  }

  function installGestureInit() {
    document.addEventListener('pointerdown', gestureInitHandler, true);
    document.addEventListener('keydown', gestureInitHandler, true);
  }

  // ----------------------------------------------------
  // Observation du piano : le module s'active quand le
  // piano apparaît. Une fois la pill montée et le MIDI
  // résolu (succès OU échec définitif), l'observation
  // s'arrête : aucun coût continu, aucune boucle possible.
  // ----------------------------------------------------
  function watcherTick() {
    if (!document.getElementById('rockstar-piano-widget')) return;
    ensurePillMounted();
    // PAS d'initMidi ici : sans geste utilisateur la demande est
    // refusée ou attend, et rejouer à chaque mutation DOM = tempête.
    // La demande part sur le premier pointerdown/keydown (installGestureInit).
    if (observer && pillEl && pillEl.parentElement) {
      observer.disconnect();
      observer = null;
    }
  }

  function watchPiano() {
    if (observer) return;

    // Déjà présent au chargement ?
    watcherTick();

    observer = new MutationObserver(watcherTick);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    if (!coreReady()) return;
    watchPiano();
    installGestureInit();
    installRelayReceiver();

    // Ouvert en onglet avec ?midi=1 (flux d'autorisation type micro) :
    // banner explicite + bouton — la demande MIDI exige un geste, on
    // ne se fie pas au chargement. Une fois accordé, ça vaut pour
    // toute l'origine extension (donc le side panel aussi).
    if (typeof location !== 'undefined' &&
        new URLSearchParams(location.search).get('midi') === '1') {
      document.title = 'Vox Roddy — autorisation MIDI (tu peux fermer cet onglet ensuite)';
      showMidiAuthBanner();
      initMidi(true).then(() => onMidiAuthGranted()).catch(() => {});
    }
  }

  function onMidiAuthGranted() {
    document.title = 'Vox Roddy — MIDI autorisé ✓ (tu peux fermer cet onglet)';
    const banner = document.getElementById('rockstar-midi-auth-banner');
    if (banner) banner.remove();
  }

  function showMidiAuthBanner() {
    if (document.getElementById('rockstar-midi-auth-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'rockstar-midi-auth-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;' +
      'display:flex;align-items:center;gap:14px;padding:14px 18px;' +
      'background:#1e293b;color:#f1f5f9;font:14px/1.4 system-ui,sans-serif;' +
      'border-bottom:1px solid rgba(148,163,184,.3)';
    banner.innerHTML =
      '<span style="font-size:20px">🎹</span>' +
      '<span style="flex:1">Autoriser l\'accès MIDI pour le piano : clique sur le bouton, accepte si Chrome te le demande, puis tu pourras fermer cet onglet.' +
      '<div class="midi-perm-state" style="opacity:.7;font-size:12px;margin-top:4px"></div></span>';
    const btn = document.createElement('button');
    btn.textContent = 'Autoriser le MIDI';
    btn.style.cssText = 'padding:8px 16px;border-radius:8px;border:none;cursor:pointer;' +
      'background:#10b981;color:#fff;font-weight:600;font-size:14px';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'En attente…';
      // Diagnostic : état réel de la permission MIDI selon Chrome
      try {
        navigator.permissions.query({ name: 'midi' }).then(s => {
          console.info(TAG, 'permissions.query(midi) =', s.state);
          const note = banner.querySelector('.midi-perm-state');
          if (note) note.textContent = `État de la permission : ${s.state}`;
        }).catch(() => {});
      } catch (e) { /* Permissions API sans 'midi' : ignorer */ }
      initMidi(true).then(() => onMidiAuthGranted()).catch(err => {
        console.warn(TAG, 'Autorisation MIDI échouée :', err);
        btn.disabled = false;
        btn.textContent = 'Réessayer';
      });
    });
    banner.appendChild(btn);
    (document.body || document.documentElement).appendChild(banner);
  }

  // Expose une API modulaire (facultatif pour les autres widgets)
  if (coreReady()) {
    window.RockstarCore.midiInput = {
      init: initMidi,
      retry: () => { midiFailed = false; initialised = false; initMidi(true); },
      refresh: () => { refreshInputList(true); attachSelectedInput(); },
      getInputs: () => (midiAccess ? Array.from(midiAccess.inputs.values()) : []),
      getSelected: () => (midiAccess ? midiAccess.inputs.get(selectedInputId) || null : null),
      // Diagnostic : simule une note MIDI reçue (note-on 0x90)
      debugSend: (midi, velocity = 100) => handleMidiMessage({ data: [0x90, midi, velocity], target: {} }),
      // Diagnostic : log brut de tous les messages MIDI reçus
      debugListen: () => {
        if (!midiAccess) { console.warn(TAG, 'pas d\'accès MIDI'); return; }
        midiAccess.inputs.forEach(i => {
          i.onmidimessage = (e) => console.log('[MIDI raw]', i.name, e.data);
        });
        console.info(TAG, 'écoute brute active sur', midiAccess.inputs.size, 'entrée(s)');
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
