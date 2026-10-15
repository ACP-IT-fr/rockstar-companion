#!/usr/bin/env node
/**
 * Génère les 12 glyphes de motifs rythmiques du métronome en SVG statiques,
 * à partir des contours de la fonte de gravure Bravura (SMuFL, via
 * @vexflow-fonts/bravura) — têtes de notes, crochets et silences gravés par
 * des pros ; hampes et ligatures composées avec les métriques officielles
 * (metadata.json du font).
 *
 * Sortie : bloc généré dans code/extension/widgets/metronome.js
 * (METRONOME_GLYPH_SVGS), consommé par renderRhythmGrid().
 *
 * Lancer : npm run glyphs
 */
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const ROOT = path.join(__dirname, '..');
const WIDGET = path.join(ROOT, 'extension', 'widgets', 'metronome.js');
const FONT_PATH = require.resolve('@vexflow-fonts/bravura/bravura.otf');
const META_PATH = require.resolve('@vexflow-fonts/bravura/metadata.json');

// --- motifs (extraits de metronome.js pour rester source unique) -------------
const src = fs.readFileSync(WIDGET, 'utf8');
const pStart = src.indexOf('const RHYTHM_PATTERNS');
const pEnd = src.indexOf('];', pStart) + 2;
const RHYTHM_PATTERNS = eval(src.slice(pStart, pEnd) + '; RHYTHM_PATTERNS');

// --- fonte --------------------------------------------------------------------
const font = opentype.parse(fs.readFileSync(FONT_PATH).buffer || fs.readFileSync(FONT_PATH));
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
const UPM = font.unitsPerEm;
const SPACES_PER_EM = 4;                    // Bravura : 1 space = 0.25 em
const UNIT = UPM / SPACES_PER_EM;           // unités de fonte par space

function glyphPath(name) {
  const glyph = font.glyphs.get(font.charToGlyphIndex(String.fromCodePoint(name)));
  if (!glyph || !glyph.path) throw new Error('glyphe introuvable : ' + name.toString(16));
  return glyph.path.toPathData(1);
}
// noms SMuFL → points de code
const CP = {
  noteheadBlack: 0xe0a4, flag8thUp: 0xe240, flag16thUp: 0xe241,
  rest8th: 0xe4e5, augmentationDot: 0xe1e7,
  timeSig0: 0xe080, timeSig1: 0xe081, timeSig2: 0xe082, timeSig3: 0xe083,
  timeSig4: 0xe084, timeSig5: 0xe085, timeSig6: 0xe086, timeSig7: 0xe087,
  timeSig8: 0xe088, timeSig9: 0xe089,
};

// --- géométrie (en spaces, échelle px par space) ------------------------------
const VB_W = 54, VB_H = 40;
const S = 7.6;                       // px par space (glyphes remplissant le bouton)
const K = S / UNIT;                  // px par unité de fonte
const HEAD_CY = 29;                  // position verticale des têtes
const HEAD_W = 1.18 * S;             // largeur tête Bravura
const STEM_T = meta.engravingDefaults.stemThickness * S;      // 0.12 space
const BEAM_T = meta.engravingDefaults.beamThickness * S;      // 0.5 space
const BEAM_GAP = meta.engravingDefaults.beamSpacing * S;      // 0.25 space
const STEM_LEN = 2.6 * S;            // raccourci pour tenir dans l'icône
const STEM_TOP = HEAD_CY - STEM_LEN;
const xFor = (o) => 5 + o * 40;      // centre horizontal de la tête

function svgUse(cp, tx, ty, extraScale) {
  const k = K * (extraScale || 1);
  return `<path transform="translate(${r2(tx)} ${r2(ty)}) scale(${r3(k)} ${r3(-k)})" d="${glyphPath(cp)}"/>`;
}
function r2(n) { return Math.round(n * 100) / 100; }
function r3(n) { return Math.round(n * 1000) / 1000; }

function buildGlyph(events, tuplet) {
  const parts = [];
  const notes = events.filter((e) => !e.rest);
  events.forEach((ev) => {
    const x = xFor(ev.o);
    if (ev.rest) {
      // Silence de croche : glyphe gravé, centré verticalement sur la tête.
      parts.push(svgUse(CP.rest8th, x + 0.4 * S, HEAD_CY + 0.16 * S));
      return;
    }
    const headLeft = x - HEAD_W / 2;
    parts.push(svgUse(CP.noteheadBlack, headLeft, HEAD_CY));
    const stemX = headLeft + HEAD_W - STEM_T;
    if (ev.dot) {
      parts.push(svgUse(CP.augmentationDot, x + HEAD_W / 2 + 0.4 * S, HEAD_CY));
    }
    parts.push(`<rect x="${r2(stemX)}" y="${r2(STEM_TOP)}" width="${r2(STEM_T + 0.3)}" height="${r2(HEAD_CY - STEM_TOP)}"/>`);
  });
  if (notes.length === 1 && (notes[0].d || 0) > 0) {
    // Note isolée : vrai crochet Bravura attaché en haut de hampe.
    const n = notes[0];
    const stemX = xFor(n.o) + HEAD_W / 2 - STEM_T;
    const cp = n.d === 1 ? CP.flag8thUp : CP.flag16thUp;
  parts.push(svgUse(cp, stemX, STEM_TOP));
  } else if (notes.length > 1) {
    // Ligatures par segment : profondeur commune min(d_i, d_j), largeur
    // arrêtée aux hampes ; crochet Bravura sur la note plus rapide.
    for (let i = 0; i < notes.length - 1; i++) {
      const shared = Math.min(notes[i].d || 0, notes[i + 1].d || 0);
      if (shared < 1) continue;
      const x1 = xFor(notes[i].o) + HEAD_W / 2 - STEM_T;
      const x2 = xFor(notes[i + 1].o) + HEAD_W / 2 - STEM_T;
      for (let b = 1; b <= shared; b++) {
        parts.push(`<rect x="${r2(x1)}" y="${r2(STEM_TOP + (b - 1) * (BEAM_T + BEAM_GAP))}" width="${r2(x2 - x1 + STEM_T + 0.3)}" height="${r2(BEAM_T)}"/>`);
      }
    }
    notes.forEach((n, i) => {
      const d = n.d || 0;
      const left = i > 0 ? Math.min(d, notes[i - 1].d || 0) : 0;
      const right = i < notes.length - 1 ? Math.min(d, notes[i + 1].d || 0) : 0;
      const connected = Math.max(left, right);
      if (d <= connected) return;
      const stemX = xFor(n.o) + HEAD_W / 2 - STEM_T;
      const stubLeft = right >= left && i < notes.length - 1 ? false : i > 0;
      for (let b = connected + 1; b <= d; b++) {
        parts.push(`<rect x="${r2(stubLeft ? stemX - 0.62 * S : stemX)}" y="${r2(STEM_TOP + (b - 1) * (BEAM_T + BEAM_GAP))}" width="${r2(0.62 * S)}" height="${r2(BEAM_T)}"/>`);
      }
    });
  }
  if (tuplet) {
    // Chiffre du n-olet : glyphe timeSig de Bravura, réduit.
    const str = String(tuplet);
    const digitScale = 0.42;
    const digitH = 2 * digitScale * S;          // timeSig : 2 spaces de haut
    const digitW = digitScale * S * 0.95;
    let dx = VB_W / 2 - (str.length * digitW) / 2;
    for (const ch of str) {
      parts.push(svgUse(CP['timeSig' + ch], dx, STEM_TOP - digitH - 0.2 * S, digitScale));
      dx += digitW;
    }
  }
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}" xmlns="http://www.w3.org/2000/svg" fill="currentColor">${parts.join('')}</svg>`;
}

const out = {};
RHYTHM_PATTERNS.forEach((p) => { out[p.id] = buildGlyph(p.events, p.tuplet); });

// --- injection dans metronome.js ----------------------------------------------
const BEGIN = '// BEGIN GENERATED METRONOME GLYPHS (npm run glyphs — contours Bravura)';
const END = '// END GENERATED METRONOME GLYPHS';
const block = `${BEGIN}
const METRONOME_GLYPH_SVGS = ${JSON.stringify(out, null, 2)};
${END}`;
let newSrc;
if (src.includes(BEGIN)) {
  const bStart = src.indexOf(BEGIN);
  const bEnd = src.indexOf(END) + END.length;
  newSrc = src.slice(0, bStart) + block + src.slice(bEnd);
} else {
  const anchor = 'function renderRhythmGrid()';
  const aIdx = src.indexOf(anchor);
  newSrc = src.slice(0, aIdx) + block + '\n\n  ' + src.slice(aIdx);
}
fs.writeFileSync(WIDGET, newSrc);
console.log('glyphes générés :', Object.keys(out).join(', '));
