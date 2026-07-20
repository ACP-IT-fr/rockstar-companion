#!/bin/bash

# Configuration
LOCAL_DIR="landing-page/"
REMOTE_TARGET="massive-hoster:domains/vox-roddy.acp-it.fr/public_html"

echo "🚀 Début du déploiement de Vox Roddy..."
echo "📂 Source : $LOCAL_DIR"
echo "🌐 Destination : $REMOTE_TARGET"

# Exécuter rsync (avec -L pour déréférencer les liens symboliques comme landing-page/extension)
rsync -avzL --delete "$LOCAL_DIR" "$REMOTE_TARGET"

if [ $? -eq 0 ]; then
  echo "✅ Déploiement terminé avec succès !"
else
  echo "❌ Une erreur est survenue lors du déploiement."
  exit 1
fi
