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
      const card = document.getElementById(cardId);
      if (widget && card) {
        card.appendChild(widget);
      }
    });

    // Le piano crée son DOM paresseusement : l'afficher puis le monter.
    if (window.RockstarCore.pianoWidget && typeof window.RockstarCore.pianoWidget.show === 'function') {
      window.RockstarCore.pianoWidget.show();
      const piano = document.getElementById('rockstar-piano-widget');
      const pianoCard = document.getElementById('sp-card-piano');
      if (piano && pianoCard) pianoCard.appendChild(piano);
    }

    // getOrCreateFloatingBar (utilisé par le piano comme conteneur par défaut)
    // a pu créer une barre flottante vide dans le panneau : on la retire.
    const strayBar = document.getElementById('rockstar-floating-bar');
    if (strayBar && !strayBar.firstChild) {
      strayBar.remove();
    }
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
  }

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();