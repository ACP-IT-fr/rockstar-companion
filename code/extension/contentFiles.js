/**
 * contentFiles.js — SOURCE UNIQUE de la liste des fichiers injectés dans les
 * pages web. Consommé par :
 *  - popup.js (injection ponctuelle via chrome.scripting.executeScript)
 *  - settingsPanel.js (enregistrement dynamique d'un domaine via
 *    chrome.scripting.registerContentScripts)
 *
 * NB : le manifest.json est déclaratif et ne peut pas référencer ce fichier —
 * sa section `content_scripts` duplique cette liste pour ultimate-guitar et
 * youtube : garder les deux en phase.
 */
(function (g) {
  g.ROCKSTAR_CONTENT_FILES = {
    css: ['content.css'],
    js: [
      'storageService.js',
      'core.js',
      'voiceEngine.js',
      'widgets/floatingBar.js',
      'widgets/floatingButton.js',
      'widgets/scroll.js',
      'widgets/metronome.js',
      'widgets/tuner.js',
      'widgets/chordDetector.js',
      'widgets/repertoireDrawer.js',
      'widgets/youtubeController.js',
      'widgets/singingTracker.js',
      'widgets/pianoKeyboard.js',
      'widgets/midiInput.js',
      'widgets/onboarding.js'
    ]
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
