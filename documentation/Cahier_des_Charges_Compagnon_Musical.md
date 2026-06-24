# Cahier des Charges : Compagnon Musical Mains Libres (PWA)

## 1. Objectifs et Plateforme
* **Concept :** Un assistant virtuel pour guitaristes-chanteurs permettant de gérer son répertoire et de contrôler l'affichage et les outils à la voix.
* **Format :** Progressive Web App (PWA) multiplateforme, optimisée en priorité pour **iPhone** et **MacBook** (installable sur l'écran d'accueil/dock).
* **Mode de fonctionnement :** Hybride (En ligne / Hors-ligne).

## 2. Structure et Modèle d'un Morceau
Chaque chanson du répertoire est une entité unique qui regroupe :
* **Ressource principale (Affichage) :** Un fichier PDF importé **OU** un lien URL (ex: Ultimate Guitar, nécessitant une connexion initiale au compte).
* **Ressource audio complémentaire (Optionnelle) :** Un lien YouTube **OU** un lien Spotify Premium (via le SDK Web Playback).
* **Préférences & Métadonnées :**
  * Transposition par défaut (+/- x demi-tons).
  * Position du capodastre (ex: Case 3).
  * Champ texte libre (notes personnelles, rappels de jeu, structure).

## 3. Gestion des Playlists
* Création et organisation de listes de morceaux (setlists).
* Enchaînement fluide d'un morceau à un autre, peu importe que la ressource principale soit un PDF ou un lien web.

## 4. Fonctionnalités Mains Libres (Commandes Vocales "Hors-Jeu")
L'écoute s'active uniquement lors des moments de pause (pas de détection pendant le jeu musical pour éviter les erreurs). L'utilisateur peut configurer la langue des commandes vocales dans les réglages de l'application (Français ou Anglais).

* **Contrôle du lecteur :** 
  * Français : *"Suivant"*, *"Précédent"*
  * Anglais : *"Next"*, *"Previous"* (ou *"Back"*)
* **Contrôle de l'écran (défilement) :** 
  * Français : *"Descends"*, *"Monte"*, *"Haut"* (retour au début)
  * Anglais : *"Down"*, *"Up"*, *"Top"*
* **Contrôle du playback audio (YouTube/Spotify) :** 
  * Français : *"Play"*, *"Pause"*, *"Recule"* (retour de 10s), *"Recommence"*
  * Anglais : *"Play"*, *"Pause"*, *"Rewind"* ou *"Back"*, *"Restart"*
* **Outils intégrés :**
  * Métronome : 
    * Français : *"Métronome [BPM]"* (ex: "Métronome 120"), *"Stop métronome"*
    * Anglais : *"Metronome [BPM]"*, *"Stop metronome"* (ou *"Metronome stop"*)
  * Accordeur : 
    * Français : *"Accordeur"* (activation du visuel)
    * Anglais : *"Tuner"*

## 5. Outils Vocaux et Intégration Audio
* **Pitch Tracker (Outil de chant) :** Intégration du module existant basé sur la *Web Audio API*. Analyse de la fréquence de la voix en temps réel.
* **Accordeur de guitare :** Analyse de la fréquence de l'instrument.

## 6. Spécifications du Mode Hors-Ligne (Offline First)
En l'absence de connexion réseau, la PWA bascule en mode dégradé mais reste parfaitement fonctionnelle pour le cœur du jeu :
* **Accessibles hors-ligne :**
  * L'application elle-même (l'interface s'ouvre grâce au cache du navigateur).
  * Toutes les playlists et les métadonnées (préférences de capo, transpo, notes de texte) stockées localement dans le navigateur (*IndexedDB*).
  * Tous les morceaux basés sur des **fichiers PDF** (sauvegardés localement).
  * Le métronome, l'accordeur et le **Pitch Tracker vocal** (100 % local).
  * Les commandes vocales de navigation (si l'OS supporte la reconnaissance vocale locale).
* **Non accessibles hors-ligne :** Les liens Web (WebViews Ultimate Guitar) et le streaming audio (YouTube/Spotify).

## 7. Ergonomie et Interface
* **Universalité des fonctionnalités :** L'ensemble des outils (métronome, accordeur, pitch tracker, playlists, configuration) est disponible et fonctionnel sur tous les terminaux (mobiles, tablettes, ordinateurs de bureau).
* **Interface Épurée & Minimaliste :** Afin de ne pas perturber l'attention de l'artiste pendant le jeu, l'affichage principal se focalise sur la partition (jusqu'à 95% de l'écran en mode scène mobile). Les panneaux et réglages secondaires sont dissimulés sous forme de menus tiroirs (drawers), barres latérales rétractables ou modales, faciles à ouvrir d'un geste simple ou d'une commande vocale.
* **Mode Standard (Grand Écran / MacBook) :** Disposition multi-panneaux avec barre de setlist à gauche, affichage large central de la partition, et affichage en temps réel des graphiques audio.
* **Mode Scène (Petit Écran / iPhone) :** Priorité maximale à la tablature/PDF. Les outils comme le Pitch Tracker se réduisent à un simple indicateur flottant discret (ex: affichage de la note cible "Sol#" ou "A" en gros caractères contrastés).

## 8. Hébergement et Versionnement
* **Versionnement :** Dépôt public ou privé sur **GitHub** pour le suivi de version, la collaboration et l'intégration continue.
* **Hébergement :** Déploiement automatisé sur la plateforme Cloud **Vercel**, configuré avec la branche de production pour une mise en production à chaque mise à jour de code.
