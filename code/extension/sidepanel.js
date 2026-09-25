/**
 * sidepanel.js — montage des widgets dans le side panel.
 *
 * Même principe que dashboard/dashboard.js : les fichiers de widgets
 * originaux s'initialisent via RockstarCore.registerInit() et créent leur
 * DOM dans document.body ; ce script déplace ensuite chaque widget dans sa
 * carte. Les widgets restent ainsi réutilisables dans les trois contextes :
 * page web (content script), dashboard web standalone, side panel.
 */
(function() {
  'use strict';

  // widgetId (DOM) → carte du panneau
  const WIDGET_MAP = {
    'ug-metronome': 'sp-card-metronome',
    'ug-tuner': 'sp-card-tuner',
    'ug-chord': 'sp-card-chord',
    'ug-singing-tracker': 'sp-card-singing',
    'rockstar-piano-widget': 'sp-card-piano'
  };

  const TABS = ['practice', 'piano'];

  // --- Toggle "widgets dans le panneau" --------------------------------------
  function setupModeToggle() {
    const checkbox = document.getElementById('sp-mode-panel');
    const note = document.getElementById('sp-disabled-note');
    if (!checkbox) return;

    window.RockstarCore.safeStorageSyncGet(['useSidePanel'], (res) => {
      checkbox.checked = res.useSidePanel !== false;
      updateNote(checkbox.checked);
    });

    checkbox.addEventListener('change', () => {
      window.RockstarCore.safeStorageSyncSet({ useSidePanel: checkbox.checked });
      updateNote(checkbox.checked);
    });

    window.RockstarCore.onSettingsChanged(function(s) {
      if (checkbox.checked !== s.useSidePanel) {
        checkbox.checked = s.useSidePanel;
        updateNote(s.useSidePanel);
      }
    });

    function updateNote(enabled) {
      if (note) note.hidden = enabled;
    }
  }

  // --- Onglets -----------------------------------------------------------------
  function setupTabs() {
    const nav = document.getElementById('sp-tabs');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.sp-tab');
      if (!btn) return;
      nav.querySelectorAll('.sp-tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.sp-tab-panel').forEach((p) => {
        p.classList.toggle('active', p.id === 'sp-tab-' + btn.dataset.tab);
      });
    });
  }

  // --- Montage des widgets dans leurs cartes -----------------------------------
  function mountWidgets() {
    Object.entries(WIDGET_MAP).forEach(([widgetId, cardId]) => {
      const widget = document.getElementById(widgetId);
      const cardBody = document.querySelector('#' + cardId + ' .widget-card-body') ||
        document.getElementById(cardId);
      if (widget && cardBody) {
        cardBody.appendChild(widget);
      }
    });

    // Le piano crée son DOM paresseusement : l'afficher puis le monter.
    if (window.RockstarCore.pianoWidget && typeof window.RockstarCore.pianoWidget.show === 'function') {
      window.RockstarCore.pianoWidget.show();
      const piano = document.getElementById('rockstar-piano-widget');
      const pianoCardBody = document.querySelector('#sp-card-piano .widget-card-body') ||
        document.getElementById('sp-card-piano');
      if (piano && pianoCardBody) pianoCardBody.appendChild(piano);
    }

    // getOrCreateFloatingBar (utilisé par le piano comme conteneur par défaut)
    // a pu créer une barre flottante vide dans le panneau : on la retire.
    const strayBar = document.getElementById('rockstar-floating-bar');
    if (strayBar && !strayBar.firstChild) {
      strayBar.remove();
    }
  }

  // --- Bridge panneau -> onglet actif ------------------------------------------
  // Toutes les actions sur la page passent par le hub (background.js),
  // qui relaye vers le même router de commandes que le contrôle vocal.
  function sendTabCommand(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'rockstar:panel-to-tab', payload: { kind: 'command', text } },
        (res) => {
          if (chrome.runtime.lastError) {
            void chrome.runtime.lastError;
            resolve({ ok: false, error: 'no-content-script' });
            return;
          }
          resolve(res || { ok: false, error: 'no-response' });
        }
      );
    });
  }

  function showCmdStatus(text) {
    const status = document.getElementById('sp-cmd-status');
    if (!status) return;
    status.hidden = false;
    status.textContent = text;
    clearTimeout(showCmdStatus._t);
    showCmdStatus._t = setTimeout(() => { status.hidden = true; }, 2500);
  }

  function setupPlaybackTab() {
    document.querySelectorAll('.sp-cmd[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = await sendTabCommand(btn.dataset.cmd);
          if (res && res.ok) {
            showCmdStatus('✓ Commande envoyée à la page');
          } else {
            const why = res && res.error === 'no-content-script'
              ? "La page active ne contient pas l'extension (essaie sur YouTube ou ultimate-guitar)"
              : 'Commande non reconnue sur cette page';
            showCmdStatus(why);
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // --- Bootstrap ----------------------------------------------------------------
  function boot() {
    if (!window.RockstarCore || typeof window.RockstarCore.initialize !== 'function') {
      console.error('[SidePanel] RockstarCore indisponible');
      return;
    }

    window.RockstarCore.initialize();

    mountWidgets();
    setupTabs();
    setupModeToggle();
    setupPlaybackTab();
  }

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();