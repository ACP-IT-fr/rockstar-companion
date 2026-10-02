const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'code', 'extension', 'manifest.json');
const packagePath = path.join(rootDir, 'package.json');

const arg = process.argv[2];
const bumpTypes = ['patch', 'minor', 'major'];
let newVersion;

const readVersion = (file) => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.version;
};

if (bumpTypes.includes(arg)) {
  const [maj, min, pat] = String(readVersion(manifestPath)).split('.').map((n) => parseInt(n, 10) || 0);
  if (arg === 'major') newVersion = `${maj + 1}.0.0`;
  else if (arg === 'minor') newVersion = `${maj}.${min + 1}.0`;
  else newVersion = `${maj}.${min}.${pat + 1}`;
} else if (arg && /^\d+(\.\d+){1,3}$/.test(arg)) {
  newVersion = arg;
} else {
  console.error('Usage : node scripts/release.js <patch|minor|major|x.y[.z]>');
  process.exit(1);
}

const oldVersion = readVersion(manifestPath);
console.log(`🚀 Release : ${oldVersion} → ${newVersion}`);

// 1. Tests d'abord — on ne publie pas sur du rouge
console.log('🧪 Tests...');
execSync('node code/tests/run-tests.js', { stdio: 'inherit', cwd: rootDir });

// 2. Bump des versions (manifest Chrome : entiers uniquement)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = newVersion.split('.').map((n) => parseInt(n, 10)).join('.');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`  ✓ manifest.json → ${manifest.version}`);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`  ✓ package.json → ${newVersion}`);

// 3. Build du zip de production
console.log('📦 Packaging...');
execSync('node scripts/package.js', { stdio: 'inherit', cwd: rootDir });

const zipFile = path.join(rootDir, 'dist', 'vox-roddy-extension.zip');
const zipManifest = JSON.parse(JSON.stringify(manifest));
console.log(`✅ Version ${zipManifest.version} prête : ${path.relative(rootDir, zipFile)}`);
console.log('➡️  Commit + tag, puis upload du zip sur le Chrome Web Store dashboard.');
