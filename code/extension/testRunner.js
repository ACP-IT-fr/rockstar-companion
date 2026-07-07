// testRunner.js
(function() {
  window.addEventListener('load', () => {
    if (new URLSearchParams(window.location.search).get('test') !== 'true') {
      console.log("[TEST] Autostart of integration tests disabled. Add ?test=true to URL to run tests.");
      return;
    }
    setTimeout(async () => {
      const resultsDiv = document.createElement('div');
      resultsDiv.id = 'test-results';
      resultsDiv.style.cssText = 'background: #222; color: #fff; padding: 20px; border: 2px solid #555; font-family: monospace; white-space: pre; position: fixed; top: 10px; left: 10px; z-index: 10000; width: 600px; max-height: 400px; overflow-y: auto;';
      resultsDiv.innerText = 'Starting Vox Roddy integration tests...\n';
      document.body.appendChild(resultsDiv);

      const log = (msg, success = true) => {
        const span = document.createElement('div');
        span.style.color = success ? '#4CAF50' : '#F44336';
        span.innerText = msg;
        resultsDiv.appendChild(span);
        console.log("[TEST] " + msg);
      };

      try {
        const core = window.RockstarCore;
        if (!core) throw new Error("RockstarCore not found");

        const simulateSpeech = async (text) => {
          if (window.mockSpeechRecognition) {
            window.mockSpeechRecognition.simulateResult(text, true);
          } else {
            core.handleCommand(text);
          }
          await new Promise(r => setTimeout(r, 200));
        };

        // Réinitialiser la vitesse de scroll pour le test
        core.scrollSpeed = 1;

        // 1. Simuler l'acceptation de la bannière si présente
        const acceptBtn = document.getElementById('banner-btn-accept');
        if (acceptBtn) {
          acceptBtn.click();
          log("1. Bannière d'activation détectée et acceptée.");
        } else {
          log("1. Bannière d'activation non détectée (déjà acceptée).");
        }

        // Attendre que tout s'initialise
        await new Promise(r => setTimeout(r, 1000));

        // 2. Test du réveil du bouton micro
        const btn = document.getElementById('ug-voice-btn');
        if (!btn) throw new Error("Voice button not found");
        log(`2. État initial du bouton micro : ${btn.className} (Texte: ${btn.textContent})`);

        // Simuler le clic pour activer et réveiller
        btn.click();
        await new Promise(r => setTimeout(r, 100));
        log(`3. Après clic, état du bouton micro : ${btn.className} (Texte: ${btn.textContent})`);
        
        // Vérifier si réveillé (awake)
        const isAwake = btn.classList.contains('awake');
        log(`4. Le micro est réveillé (jaune/vert) : ${isAwake ? 'SUCCESS' : 'FAILED'}`, isAwake);

        // 3. Tester la commande de mise en veille vocale "dors"
        await simulateSpeech('dors');
        const isSleeping = !btn.classList.contains('awake') && btn.classList.contains('listening');
        log(`5. Commande de mise en veille "dors" : ${isSleeping ? 'SUCCESS' : 'FAILED'} (Classe bouton: ${btn.className})`, isSleeping);

        // 4. Tester la commande "défile" après réveil
        btn.click(); // réveiller
        await new Promise(r => setTimeout(r, 100));
        const initialScroll = window.scrollY;
        await simulateSpeech('défile');
        await new Promise(r => setTimeout(r, 500));
        const postScroll = window.scrollY;
        const hasScrolled = postScroll > initialScroll;
        log(`6. Commande "défile" : ${hasScrolled ? 'SUCCESS' : 'FAILED'} (Scroll initial: ${initialScroll}, Actuel: ${postScroll})`, hasScrolled);

        // 5. Tester la commande "plus vite"
        const initialSpeed = core.scrollSpeed;
        await simulateSpeech('plus vite');
        const postSpeed = core.scrollSpeed;
        const hasIncreased = postSpeed > initialSpeed;
        log(`7. Commande "plus vite" : ${hasIncreased ? 'SUCCESS' : 'FAILED'} (Vitesse initiale: ${initialSpeed}, Actuelle: ${postSpeed})`, hasIncreased);

        // 6. Tester la commande "pause"
        await simulateSpeech('pause');
        const scrollAtPause1 = window.scrollY;
        await new Promise(r => setTimeout(r, 200));
        const scrollAtPause2 = window.scrollY;
        const stopped = scrollAtPause1 === scrollAtPause2;
        log(`8. Commande "pause" (arrêt scroll) : ${stopped ? 'SUCCESS' : 'FAILED'} (Scroll à 200ms: ${scrollAtPause1}, à 400ms: ${scrollAtPause2})`, stopped);

        // 7. Tester le métronome "démarre le métronome"
        await simulateSpeech('démarre le métronome');
        const playBtn = document.getElementById('metronome-play-btn');
        const isMetronomePlaying = playBtn && playBtn.textContent.trim() === '⏸';
        log(`9. Commande "démarre le métronome" : ${isMetronomePlaying ? 'SUCCESS' : 'FAILED'} (Bouton: ${playBtn ? playBtn.textContent : 'null'})`, isMetronomePlaying);

        // 8. Tester le tempo "tempo 150"
        await simulateSpeech('tempo 150');
        const bpmDisplay = document.getElementById('metronome-bpm-display');
        const isBpmCorrect = bpmDisplay && bpmDisplay.textContent.includes('150');
        log(`10. Commande "tempo 150" : ${isBpmCorrect ? 'SUCCESS' : 'FAILED'} (Affichage: ${bpmDisplay ? bpmDisplay.textContent : 'null'})`, isBpmCorrect);

        // 9. Tester l'arrêt "arrête le métronome"
        await simulateSpeech('arrête le métronome');
        const isMetronomeStopped = playBtn && playBtn.textContent.trim() === '▶';
        log(`11. Commande "arrête le métronome" : ${isMetronomeStopped ? 'SUCCESS' : 'FAILED'} (Bouton: ${playBtn ? playBtn.textContent : 'null'})`, isMetronomeStopped);

        // 10. Vérifier les conteneurs tuner, accord et singing tracker
        const tuner = document.getElementById('ug-tuner');
        const chord = document.getElementById('ug-chord');
        const singing = document.getElementById('ug-singing-tracker');
        log(`12. Présence de l'accordeur (#ug-tuner) : ${tuner ? 'SUCCESS' : 'FAILED'}`, !!tuner);
        log(`13. Présence du détecteur d'accords (#ug-chord) : ${chord ? 'SUCCESS' : 'FAILED'}`, !!chord);
        log(`14. Présence du tracker de chant (#ug-singing-tracker) : ${singing ? 'SUCCESS' : 'FAILED'}`, !!singing);

        log("\n--- TOUS LES TESTS D'INTÉGRATION SONT COMPLÉTÉS ---");
      } catch (e) {
        log("Fatal error during tests: " + e.message + "\n" + e.stack, false);
      }
    }, 200);
  });
})();
