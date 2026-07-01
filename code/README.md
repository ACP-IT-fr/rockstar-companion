# UG Voice Control - Extension Chrome

Cette extension permet de contrôler vocalement le site **Ultimate Guitar** pour rechercher des morceaux, faire défiler les tablatures, et gérer un répertoire personnel avec des playbacks et des notes de jeu.

## Fonctionnalités

- **Contrôle Vocal mains libres :** Dites le mot déclencheur (par défaut **"Rockstar"**) suivi d'une commande pour piloter Ultimate Guitar.
- **Répertoire Personnel (Dashboard) :** Enregistrez vos morceaux favoris, ajoutez-y des notes d'interprétation, des astuces de jeu, des capodastres/transpositions et des liens de playback YouTube/Spotify.
- **Paramètres personnalisables :** Changez le mot déclencheur ou activez/désactivez l'extension sur des sites spécifiques.

## Installation (Mode Développeur)

Pour installer et tester l'extension localement dans Google Chrome :

1. Ouvrez Google Chrome et accédez à l'adresse `chrome://extensions/`.
2. Activez le **Mode développeur** (Developer mode) en haut à droite.
3. Cliquez sur **Charger l'extension non empaquetée** (Load unpacked) en haut à gauche.
4. Sélectionnez le dossier `code/extension` de ce projet.

## Commandes Vocales Disponibles

Commencez par prononcer le mot déclencheur (ex: **"Rockstar"**) puis l'une des commandes suivantes :

- **Recherche :** `"Rockstar search for [nom_chanson]"` / `"Rockstar cherche [nom_chanson]"`
- **Défilement :**
  - `"Rockstar scroll down"` / `"Rockstar défile"`
  - `"Rockstar scroll up"` / `"Rockstar monte"`
  - `"Rockstar go to top"` / `"Rockstar début"`
  - `"Rockstar faster"` / `"Rockstar plus vite"`
  - `"Rockstar slower"` / `"Rockstar moins vite"`
  - `"Rockstar pause"` (suspendre)
  - `"Rockstar stop"` / `"Rockstar dors"` (veille)
