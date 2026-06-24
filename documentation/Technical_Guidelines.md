# Technical Guidelines

Ce document regroupe les directives techniques à suivre pour le développement de l'application Compagnon Musical.

## 1. Découplage et Modularité (Vue.js & TypeScript)
* Garder les différentes parties de l'application les plus **découplées possible**.
* Utiliser **Vue 3** (Composition API) avec TypeScript :
  * **Composants d'Interface (SFC - Single File Components)** : Fichiers `.vue` pour la structure, le style Tailwind et la réactivité locale.
  * **Composables / Services (TypeScript)** : Fonctions réutilisables typées (ex: `useAudio.ts` pour la Web Audio API, `useSpeech.ts` pour la reconnaissance vocale supportant le français et l'anglais) pour isoler complètement la logique métier de l'affichage.
  * **Gestion d'État (Store réactif)** : Utiliser un état global réactif simple pour gérer les morceaux, les playlists, et les préférences de l'utilisateur (telles que la langue des commandes vocales : fr-FR ou en-US).

## 2. Simplicité du Code
* Écrire le code le plus **simple et lisible possible** (KISS - Keep It Simple, Stupid).
* Privilégier des fonctions courtes dotées d'une responsabilité unique, avec des types et interfaces clairs.
* Commenter les parties complexes, en particulier l'algorithme d'autocorrélation audio et la gestion des tampons (buffers).

## 3. Responsive Design & Styling (Tailwind CSS)
* **Accessibilité Universelle** : Toutes les fonctionnalités (métronome, accordeur, pitch tracker, playlists, configuration) doivent être fonctionnelles et accessibles sur **tous les types d'écrans** (mobile, tablette, desktop).
* **Interface Épurée & Minimaliste** : Pour préserver la lisibilité (notamment en jeu), l'interface doit rester propre. Masquer les outils et réglages secondaires dans des tiroirs coulissants (drawers), des barres latérales rétractables ou des overlays modaux.
* **Conception "Mobile First"** avec adaptation aux breakpoints de **Tailwind CSS** (ex: `hidden md:block` pour masquer ou afficher des volets selon la largeur d'écran).
* Utilisation intensive des classes flexibles, de grille et de positionnement de Tailwind (ex: `flex`, `grid`, `fixed`, `z-50`) pour créer des overlays et tiroirs fluides.

## 4. Sécurité & Bonnes Pratiques
* Assurer la sécurité du code en nettoyant les entrées utilisateur pour éviter les failles XSS (notamment lors de l'intégration de liens web ou de l'affichage de textes importés).
* Gérer les autorisations d'accès aux périphériques (microphone) de façon sécurisée et transparente avec des retours d'état clairs pour l'utilisateur.
* Limiter l'exécution de scripts tiers non approuvés.

## 5. Compatibilité Multi-Plateforme (iOS/macOS)
* Assurer le bon fonctionnement sur Safari Mobile (iOS) et Safari/Chrome Desktop (macOS).
* Gérer les spécificités de la Web Audio API sur iOS (nécessite un geste utilisateur explicite comme un clic pour débloquer l'AudioContext).
* Gérer la PWA avec un Service Worker robuste compatible avec les politiques de mise en cache strictes de WebKit/Safari.

## 6. Versioning & Déploiement
* **Versionnement (GitHub)** : Tout le code source, les fichiers de configuration et la documentation doivent être versionnés à l'aide de **Git** et hébergés sur un dépôt **GitHub**.
* **Déploiement (Vercel)** : L'application sera déployée sur **Vercel**. Une intégration CI/CD sera mise en place via GitHub pour déployer automatiquement chaque commit poussé sur la branche principale (`main`), garantissant un retour d'expérience rapide et des builds de prévisualisation pour chaque branche de travail.
