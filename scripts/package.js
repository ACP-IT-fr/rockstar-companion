const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'code', 'extension');
const distDir = path.join(rootDir, 'dist');
const tempDir = path.join(distDir, 'prod_build');
const zipFile = path.join(distDir, 'vox-roddy-extension.zip');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      if (childItemName === 'mock.html' || childItemName === 'testRunner.js' || childItemName === 'exportService.js' || childItemName === '.DS_Store' || childItemName === '__MACOSX') {
        return;
      }
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log("📦 Préparation du package de production sans les indicateurs DEV...");

// 1. Nettoyage
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Copier l'extension dans le répertoire temporaire
copyRecursiveSync(srcDir, tempDir);

// 3. Retirer les préfixes / badges [DEV] dans les fichiers i18n
const locFiles = [
  path.join(tempDir, '_locales', 'fr', 'messages.json'),
  path.join(tempDir, '_locales', 'en', 'messages.json')
];

locFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\[DEV\]\s*/g, '');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ✓ Nettoyé : ${path.relative(rootDir, file)}`);
  }
});

// 4. Retirer les badges [DEV] dans popup.html et floatingBar.js
const popupHtml = path.join(tempDir, 'popup.html');
if (fs.existsSync(popupHtml)) {
  let content = fs.readFileSync(popupHtml, 'utf8');
  content = content.replace(/\s*<span class="dev-badge">DEV<\/span>/g, '');
  fs.writeFileSync(popupHtml, content, 'utf8');
  console.log(`  ✓ Nettoyé : ${path.relative(rootDir, popupHtml)}`);
}

const floatingBar = path.join(tempDir, 'widgets', 'floatingBar.js');
if (fs.existsSync(floatingBar)) {
  let content = fs.readFileSync(floatingBar, 'utf8');
  content = content.replace(/\s*<span class="dev-badge">DEV<\/span>/g, '');
  fs.writeFileSync(floatingBar, content, 'utf8');
  console.log(`  ✓ Nettoyé : ${path.relative(rootDir, floatingBar)}`);
}

// 5. Créer l'archive Zip
console.log("🤐 Compresson du fichier zip de production...");
execSync(`cd "${tempDir}" && zip -r "${zipFile}" .`, { stdio: 'inherit' });

// 6. Nettoyer le dossier temporaire
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`✅ Package de production créé avec succès : ${path.relative(rootDir, zipFile)}`);
